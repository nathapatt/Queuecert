"""FastAPI application entry point for booking-service."""

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import engine, get_db
from models import Base, Booking, Concert, Seat
from producer import KafkaProducer
from schemas import BookingRequest, BookingResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

kafka_producer = KafkaProducer()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup, dispose engine on shutdown."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created")
    yield
    kafka_producer.close()
    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(title="Queuecert Booking Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "booking-service"}


@app.post("/bookings", response_model=BookingResponse)
async def create_booking(
    request: BookingRequest,
    db: AsyncSession = Depends(get_db),
):
    # Validate concert exists
    result = await db.execute(select(Concert).where(Concert.id == request.concert_id))
    concert = result.scalar_one_or_none()
    if concert is None:
        raise HTTPException(status_code=404, detail="Concert not found")

    # Validate seat exists
    result = await db.execute(select(Seat).where(Seat.id == request.seat_id))
    seat = result.scalar_one_or_none()
    if seat is None:
        raise HTTPException(status_code=404, detail="Seat not found")

    # Create booking with pending status
    booking = Booking(
        user_id=request.user_id,
        concert_id=request.concert_id,
        seat_id=request.seat_id,
        status="pending",
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)

    # Produce message to Kafka
    kafka_producer.produce(
        "booking.requested",
        {
            "booking_id": str(booking.id),
            "user_id": str(request.user_id),
            "concert_id": str(request.concert_id),
            "seat_id": str(request.seat_id),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
    logger.info("Booking %s created and sent to Kafka", booking.id)

    return BookingResponse(
        booking_id=booking.id,
        status="pending",
        message="Booking request received and is being processed",
    )


@app.get("/bookings/{booking_id}", response_model=BookingResponse)
async def get_booking(
    booking_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = result.scalar_one_or_none()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    return BookingResponse(
        booking_id=booking.id,
        status=booking.status,
        message=f"Booking is {booking.status}",
    )
