"""Entry point for notification-service consumer loop."""

import json
import logging
import signal
import sys

from consumer import create_consumer, process_message

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

running = True


def _signal_handler(sig, frame):
    global running
    logger.info("Shutdown signal received")
    running = False


def main():
    global running
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    consumer = create_consumer()
    consumer.subscribe(["booking.confirmed", "booking.failed"])
    logger.info("notification-service consumer started, waiting for messages...")

    try:
        while running:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error("Consumer error: %s", msg.error())
                continue

            try:
                value = json.loads(msg.value().decode("utf-8"))
                logger.info("Received message on topic %s: %s", msg.topic(), value)
                process_message(msg.topic(), value)
            except Exception:
                logger.exception("Failed to process message")

    finally:
        consumer.close()
        logger.info("notification-service consumer shut down")


if __name__ == "__main__":
    main()
