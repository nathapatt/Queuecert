# Queuecert — Agent Implementation Spec

> Concert ticket booking system powered by Kafka, FastAPI, PostgreSQL, and Redis.
> Goal: clean, production-ready, MIT licensed. No over-engineering.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | Python 3.12+ |
| Package manager | `uv` + `pyproject.toml` |
| Framework | FastAPI + uvicorn |
| Message broker | Kafka (Confluent image via Docker) |
| Database | PostgreSQL 15 |
| Cache / Lock | Redis 7 |
| Migration | Alembic + SQLAlchemy 2.0 |
| Infra (local) | Docker Compose (infra only, no backend) |

---

## Project Structure

Create the following file/folder structure exactly:

```
queuecert/
├── docker-compose.yml
├── .env.example
├── .env                        # gitignored
├── .gitignore
├── LICENSE                     # MIT
├── README.md
├── pyproject.toml              # uv workspace
│
├── booking-service/
│   ├── pyproject.toml
│   ├── main.py                 # FastAPI app entry
│   ├── producer.py             # Kafka producer
│   ├── database.py             # SQLAlchemy async engine + session
│   ├── models.py               # ORM models
│   └── schemas.py              # Pydantic request/response
│
├── seat-service/
│   ├── pyproject.toml
│   ├── main.py                 # consumer loop entry
│   ├── consumer.py             # Kafka consumer logic
│   ├── locker.py               # Redis seat locking
│   └── database.py             # SQLAlchemy async engine + session
│
└── notification-service/
    ├── pyproject.toml
    ├── main.py                 # consumer loop entry
    └── consumer.py             # Kafka consumer + webhook/log notify
```

---

## Task 1 — Root files

### `docker-compose.yml`

Spin up **infra only** (no backend services). Include:

- **zookeeper** — `confluentinc/cp-zookeeper:7.5.0`, port 2181
- **kafka** — `confluentinc/cp-kafka:7.5.0`, port 9092, depends on zookeeper
  - `KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"`
  - `KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092`
- **postgres** — `postgres:15-alpine`, port 5432
  - env: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` from `.env`
  - volume: `pgdata:/var/lib/postgresql/data`
- **redis** — `redis:7-alpine`, port 6379

Add healthchecks for postgres and redis. Add named volume `pgdata`.

### `.env.example`

```env
# Postgres
POSTGRES_DB=queuecert
POSTGRES_USER=queuecert
POSTGRES_PASSWORD=secret
DATABASE_URL=postgresql+asyncpg://queuecert:secret@localhost:5432/queuecert

# Kafka
KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# Redis
REDIS_URL=redis://localhost:6379

# App
BOOKING_SERVICE_PORT=8000
```

### `.gitignore`

Standard Python gitignore. Include: `.env`, `__pycache__`, `.venv`, `*.pyc`, `.uv`

### `LICENSE`

MIT License. Year: 2025. Author placeholder: `Queuecert Contributors`

### `pyproject.toml` (root workspace)

```toml
[tool.uv.workspace]
members = ["booking-service", "seat-service", "notification-service"]
```

---

## Task 2 — Kafka Topics

Three topics used in this system:

| Topic | Producer | Consumer |
|---|---|---|
| `booking.requested` | booking-service | seat-service |
| `booking.confirmed` | seat-service | notification-service |
| `booking.failed` | seat-service | notification-service |

Message format for all topics — JSON with these fields:

```json
{
  "booking_id": "uuid",
  "user_id": "uuid",
  "concert_id": "uuid",
  "seat_id": "uuid",
  "timestamp": "ISO8601"
}
```

---

## Task 3 — Database Schema

Create Alembic migration (or run raw SQL on startup) with these tables in PostgreSQL:

### `concerts`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
name        TEXT NOT NULL
venue       TEXT NOT NULL
event_date  TIMESTAMPTZ NOT NULL
created_at  TIMESTAMPTZ DEFAULT now()
```

### `seats`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
concert_id  UUID REFERENCES concerts(id)
row         TEXT NOT NULL          -- e.g. "A", "B"
number      INT NOT NULL           -- e.g. 1, 2, 3
status      TEXT DEFAULT 'available'  -- available | locked | booked
updated_at  TIMESTAMPTZ DEFAULT now()
```

### `bookings`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID NOT NULL
concert_id  UUID REFERENCES concerts(id)
seat_id     UUID REFERENCES seats(id)
status      TEXT DEFAULT 'pending'   -- pending | confirmed | failed
created_at  TIMESTAMPTZ DEFAULT now()
```

---

## Task 4 — booking-service

### `pyproject.toml`

```toml
[project]
name = "booking-service"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.128.0",
    "uvicorn>=0.40.0",
    "confluent-kafka>=2.3.0",
    "sqlalchemy>=2.0.0",
    "asyncpg>=0.30.0",
    "alembic>=1.13.0",
    "pydantic>=2.0.0",
    "python-dotenv>=1.2.1",
]
```

### `database.py`

- Create async SQLAlchemy engine from `DATABASE_URL` env var
- Export `AsyncSession` and `get_db` dependency for FastAPI

### `models.py`

SQLAlchemy ORM models for `concerts`, `seats`, `bookings` matching schema above.

### `schemas.py`

Pydantic models:

- `BookingRequest` — fields: `user_id: UUID`, `concert_id: UUID`, `seat_id: UUID`
- `BookingResponse` — fields: `booking_id: UUID`, `status: str`, `message: str`

### `producer.py`

- Class `KafkaProducer` wrapping `confluent_kafka.Producer`
- Method `produce(topic: str, message: dict)` — serialize to JSON, produce, flush
- Read `KAFKA_BOOTSTRAP_SERVERS` from env

### `main.py`

FastAPI app with these endpoints:

**`GET /health`**
```json
{ "status": "ok", "service": "booking-service" }
```

**`POST /bookings`**
- Accept `BookingRequest`
- Validate that `concert_id` and `seat_id` exist in DB
- Create a `bookings` row with `status = "pending"`
- Produce message to `booking.requested` topic
- Return `BookingResponse` with `booking_id` and `status = "pending"`

**`GET /bookings/{booking_id}`**
- Return current booking status from DB

On startup: create DB tables if not exist (use `Base.metadata.create_all`).
On shutdown: close DB engine.

---

## Task 5 — seat-service

### `pyproject.toml`

Same dependencies as booking-service minus FastAPI/uvicorn, add:
```
"redis>=5.0.0",
```

### `locker.py`

- Class `SeatLocker` using `redis.asyncio`
- `async def lock(seat_id: str) -> bool` — SET NX with TTL 300s (5 min), return True if acquired
- `async def unlock(seat_id: str)` — DEL the key
- `async def is_locked(seat_id: str) -> bool`
- Key format: `seat_lock:{seat_id}`

### `consumer.py`

- Subscribe to `booking.requested`
- For each message:
  1. Parse JSON
  2. Call `locker.lock(seat_id)` — if False (already locked), produce `booking.failed`
  3. If locked: update `seats.status = 'locked'` and `bookings.status = 'confirmed'` in Postgres
  4. Produce to `booking.confirmed`
- Use `auto.offset.reset: earliest`, `group.id: seat-service`

### `main.py`

- Entry point: start consumer loop
- Handle `KeyboardInterrupt` gracefully (close consumer)
- Log each consumed message

---

## Task 6 — notification-service

### `pyproject.toml`

Minimal dependencies:
```toml
dependencies = [
    "confluent-kafka>=2.3.0",
    "python-dotenv>=1.2.1",
]
```

### `consumer.py`

- Subscribe to both `booking.confirmed` and `booking.failed`
- For `booking.confirmed`: log `"✅ Booking {booking_id} confirmed for user {user_id}"`
- For `booking.failed`: log `"❌ Booking {booking_id} failed for user {user_id}"`
- Use `group.id: notification-service`
- (Extensible: add real email/webhook here later)

### `main.py`

- Start consumer loop
- Handle `KeyboardInterrupt` gracefully

---

## Task 7 — README.md

Write a clean README with these sections:

### Sections

**Header** — project name `Queuecert`, one-line description, MIT badge

**Architecture** — ASCII or text diagram showing the flow:
```
Client → booking-service → [Kafka: booking.requested] → seat-service → PostgreSQL
                                                              ↓
                                                    [Kafka: booking.confirmed]
                                                              ↓
                                                    notification-service
```

**Prerequisites**
- Python 3.12+
- uv
- Docker + Docker Compose

**Getting started**

Step 1 — Clone and install
```bash
git clone https://github.com/yourname/queuecert
cd queuecert
cp .env.example .env
```

Step 2 — Start infra
```bash
docker compose up -d
```

Step 3 — Run services (each in a separate terminal)
```bash
cd booking-service && uv run uvicorn main:app --reload --port 8000
cd seat-service    && uv run python main.py
cd notification-service && uv run python main.py
```

Step 4 — Try it
```bash
curl -X POST http://localhost:8000/bookings \
  -H "Content-Type: application/json" \
  -d '{"user_id": "...", "concert_id": "...", "seat_id": "..."}'
```

**API reference** — table of endpoints

**License** — MIT

---

## Implementation Rules

Follow these rules strictly:

1. **Max 5 files per service** — do not create extra folders or helper modules unless necessary
2. **No unused imports** — keep dependencies minimal
3. **Read all config from env vars** — never hardcode URLs, ports, or credentials
4. **Async everywhere** — use `asyncpg` + `sqlalchemy[asyncio]`, `redis.asyncio`
5. **Graceful shutdown** — handle `SIGINT`/`SIGTERM` in consumer loops
6. **No cross-service imports** — services are completely independent
7. **Keep `main.py` as the single entry point** per service
8. **Log with Python `logging`** — not `print()`

---

## Acceptance Criteria

The implementation is complete when:

- [ ] `docker compose up -d` starts kafka, zookeeper, postgres, redis with no errors
- [ ] `uv run uvicorn main:app --port 8000` in booking-service starts without errors
- [ ] `POST /bookings` returns `{ "booking_id": "...", "status": "pending" }`
- [ ] seat-service logs the consumed message and updates DB
- [ ] notification-service logs `✅ Booking confirmed` or `❌ Booking failed`
- [ ] `GET /bookings/{id}` returns `confirmed` after seat-service processes it
- [ ] No service imports code from another service