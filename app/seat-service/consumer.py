"""Kafka consumer logic for seat-service.

Subscribes to `booking.requested`, attempts to lock the seat via Redis,
updates PostgreSQL, and produces to `booking.confirmed` or `booking.failed`.
"""

import json
import logging
import os
from datetime import datetime, timezone

from confluent_kafka import Consumer, Producer
from dotenv import load_dotenv

from database import async_session, engine
from locker import SeatLocker

load_dotenv()

logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")


def _create_consumer() -> Consumer:
    return Consumer(
        {
            "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
            "group.id": "seat-service",
            "auto.offset.reset": "earliest",
        }
    )


def _create_producer() -> Producer:
    return Producer({"bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS})


async def _update_seat_status(seat_id: str, status: str) -> None:
    """Update the seat status in PostgreSQL."""
    # Import here to avoid circular imports — models are defined in booking-service
    # but we use raw SQL to stay independent
    async with async_session() as session:
        await session.execute(
            update_raw_sql("seats", seat_id, "status", status)
        )
        await session.commit()


async def _update_booking_status(booking_id: str, status: str) -> None:
    """Update the booking status in PostgreSQL."""
    async with async_session() as session:
        await session.execute(
            update_raw_sql("bookings", booking_id, "status", status)
        )
        await session.commit()


def update_raw_sql(table: str, row_id: str, column: str, value: str):
    """Build a raw SQL update statement to avoid cross-service model imports."""
    from sqlalchemy import text

    if table == "seats":
        return text(
            f"UPDATE {table} SET {column} = :value, updated_at = now() WHERE id = CAST(:id AS UUID)"
        ).bindparams(value=value, id=row_id)

    return text(f"UPDATE {table} SET {column} = :value WHERE id = CAST(:id AS UUID)").bindparams(
        value=value, id=row_id
    )


async def process_message(
    msg_value: dict,
    locker: SeatLocker,
    producer: Producer,
) -> None:
    """Process a single booking.requested message."""
    booking_id = msg_value["booking_id"]
    user_id = msg_value["user_id"]
    concert_id = msg_value["concert_id"]
    seat_id = msg_value["seat_id"]

    logger.info("Processing booking %s for seat %s", booking_id, seat_id)

    # Idempotency check: skip if booking already processed
    async with async_session() as session:
        from sqlalchemy import text
        result = await session.execute(
            text("SELECT status FROM bookings WHERE id = CAST(:id AS UUID)").bindparams(id=booking_id)
        )
        booking_status = result.scalar_one_or_none()

        if booking_status and booking_status != "pending":
            logger.info("Booking %s already processed (status: %s), skipping", booking_id, booking_status)
            return

    # Attempt to lock the seat
    locked = await locker.lock(seat_id)

    if not locked:
        # Seat already locked — produce failure
        logger.warning("Seat %s already locked, booking %s failed", seat_id, booking_id)
        await _update_booking_status(booking_id, "failed")

        failure_msg = json.dumps(
            {
                "booking_id": booking_id,
                "user_id": user_id,
                "concert_id": concert_id,
                "seat_id": seat_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        producer.produce("booking.failed", value=failure_msg.encode("utf-8"))
        producer.flush()
        return

    # Lock acquired — update DB and confirm
    await _update_seat_status(seat_id, "locked")
    await _update_booking_status(booking_id, "confirmed")

    confirmation_msg = json.dumps(
        {
            "booking_id": booking_id,
            "user_id": user_id,
            "concert_id": concert_id,
            "seat_id": seat_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    producer.produce("booking.confirmed", value=confirmation_msg.encode("utf-8"))
    producer.flush()

    logger.info("Booking %s confirmed, seat %s locked", booking_id, seat_id)
