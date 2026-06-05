"""Kafka consumer for notification-service.

Subscribes to `booking.confirmed` and `booking.failed` topics,
and logs notifications for each event.
"""

import json
import logging
import os

from confluent_kafka import Consumer
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")


def create_consumer() -> Consumer:
    return Consumer(
        {
            "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
            "group.id": "notification-service",
            "auto.offset.reset": "earliest",
        }
    )


def process_message(topic: str, msg_value: dict) -> None:
    """Process a single notification message."""
    booking_id = msg_value.get("booking_id", "unknown")
    user_id = msg_value.get("user_id", "unknown")

    if topic == "booking.confirmed":
        logger.info("[CONFIRMED] Booking %s confirmed for user %s", booking_id, user_id)
    elif topic == "booking.failed":
        logger.info("[FAILED] Booking %s failed for user %s", booking_id, user_id)
    else:
        logger.warning("[UNKNOWN] Unhandled topic: %s", topic)
