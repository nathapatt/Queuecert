"""Entry point for seat-service consumer loop."""

import asyncio
import json
import logging
import signal

from consumer import _create_consumer, _create_producer, process_message
from database import engine
from locker import SeatLocker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

shutdown_event = asyncio.Event()


def _signal_handler():
    logger.info("Shutdown signal received")
    shutdown_event.set()


async def main():
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _signal_handler)

    consumer = _create_consumer()
    producer = _create_producer()
    locker = SeatLocker()

    consumer.subscribe(["booking.requested"])
    logger.info("seat-service consumer started, waiting for messages...")

    try:
        while not shutdown_event.is_set():
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error("Consumer error: %s", msg.error())
                continue

            try:
                value = json.loads(msg.value().decode("utf-8"))
                logger.info("Received message: %s", value)
                await process_message(value, locker, producer)
            except Exception:
                logger.exception("Failed to process message")

    finally:
        consumer.close()
        await locker.close()
        await engine.dispose()
        logger.info("seat-service consumer shut down")


if __name__ == "__main__":
    asyncio.run(main())
