# Queuecert

> Concert ticket booking system powered by Kafka, FastAPI, PostgreSQL, and Redis.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Architecture

```
Client → booking-service → [Kafka: booking.requested] → seat-service → PostgreSQL
                                                              ↓
                                                    [Kafka: booking.confirmed]
                                                    [Kafka: booking.failed]
                                                              ↓
                                                    notification-service
```

| Service | Role |
|---|---|
| **booking-service** | FastAPI REST API — accepts booking requests, validates data, produces Kafka events |
| **seat-service** | Kafka consumer — locks seats via Redis, updates DB, emits confirmation/failure events |
| **notification-service** | Kafka consumer — logs booking confirmations and failures |

---

## Prerequisites

- **Python 3.12+**
- **[uv](https://docs.astral.sh/uv/)** — Python package manager
- **Docker + Docker Compose**

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/yourname/queuecert
cd queuecert
cp .env.example .env
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts Zookeeper, Kafka, PostgreSQL, and Redis.

### 3. Run services

Open **three separate terminals**:

```bash
# Terminal 1 — booking-service
cd booking-service && uv run uvicorn main:app --reload --port 8000
```

```bash
# Terminal 2 — seat-service
cd seat-service && uv run python main.py
```

```bash
# Terminal 3 — notification-service
cd notification-service && uv run python main.py
```

### 4. Try it out

Create a booking:

```bash
curl -X POST http://localhost:8000/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "concert_id": "<concert-uuid>",
    "seat_id": "<seat-uuid>"
  }'
```

Check booking status:

```bash
curl http://localhost:8000/bookings/<booking-uuid>
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/bookings` | Create a new booking |
| `GET` | `/bookings/{booking_id}` | Get booking status |

### `POST /bookings`

**Request body:**

```json
{
  "user_id": "uuid",
  "concert_id": "uuid",
  "seat_id": "uuid"
}
```

**Response:**

```json
{
  "booking_id": "uuid",
  "status": "pending",
  "message": "Booking request received and is being processed"
}
```

---

## Kafka Topics

| Topic | Producer | Consumer |
|---|---|---|
| `booking.requested` | booking-service | seat-service |
| `booking.confirmed` | seat-service | notification-service |
| `booking.failed` | seat-service | notification-service |

---

## Database Schema

| Table | Key Columns |
|---|---|
| `concerts` | id, name, venue, event_date |
| `seats` | id, concert_id, row, number, status |
| `bookings` | id, user_id, concert_id, seat_id, status |

---

## License

[MIT](LICENSE)
