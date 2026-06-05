"""Kafka producer wrapper for booking-service."""

import json
import logging
import os

from confluent_kafka import Producer
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class KafkaProducer:
    """Thin wrapper around confluent_kafka.Producer."""

    def __init__(self):
        bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        self._producer = Producer({"bootstrap.servers": bootstrap_servers})

    def _delivery_report(self, err, msg):
        if err is not None:
            logger.error("Message delivery failed: %s", err)
        else:
            logger.info(
                "Message delivered to %s [%d]", msg.topic(), msg.partition()
            )

    def produce(self, topic: str, message: dict) -> None:
        """Serialize message to JSON, produce to topic, and flush."""
        try:
            payload = json.dumps(message, default=str)
            self._producer.produce(
                topic,
                value=payload.encode("utf-8"),
                callback=self._delivery_report,
            )
            # Add timeout to prevent blocking indefinitely
            remaining = self._producer.flush(timeout=5.0)
            if remaining > 0:
                logger.warning("Failed to flush %d messages within timeout", remaining)
        except Exception as e:
            logger.error("Failed to produce message to topic %s: %s", topic, e)
            raise

    def close(self) -> None:
        """Flush remaining messages."""
        self._producer.flush()
