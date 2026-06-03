import asyncio
import asyncpg
import os
import uuid
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg", "postgresql")

# 3 concerts, different scenarios
CONCERTS = [
    {
        "name": "BTS World Tour",
        "venue": "Impact Arena Bangkok",
        "event_date": "2025-12-01 19:00:00+07",
        "rows": ["A", "B", "C", "D"],
        "seats_per_row": 10,
    },
    {
        "name": "BLACKPINK Born Pink",
        "venue": "Royal Paragon Hall",
        "event_date": "2025-12-15 18:00:00+07",
        "rows": ["A", "B"],
        "seats_per_row": 5,   # small venue — easy to test sold out
    },
    {
        "name": "Coldplay Music of the Spheres",
        "venue": "Rajamangala Stadium",
        "event_date": "2026-01-10 20:00:00+07",
        "rows": ["A", "B", "C", "D", "E"],
        "seats_per_row": 10,
    },
]

# dummy users for curl examples
USERS = [
    ("11111111-1111-1111-1111-111111111111", "alice"),
    ("22222222-2222-2222-2222-222222222222", "bob"),
    ("33333333-3333-3333-3333-333333333333", "charlie"),
]


async def seed():
    conn = await asyncpg.connect(DATABASE_URL)
    print("🌱 Seeding database...\n")

    all_data = []   # collect for curl summary

    for c in CONCERTS:
        concert_id = await conn.fetchval("""
            INSERT INTO concerts (name, venue, event_date)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
            RETURNING id
        """, c["name"], c["venue"], datetime.fromisoformat(c["event_date"]))

        if not concert_id:
            concert_id = await conn.fetchval(
                "SELECT id FROM concerts WHERE name = $1", c["name"]
            )
            print(f"⚠️  Concert already exists — {c['name']}: {concert_id}")
        else:
            print(f"✅ Concert created  — {c['name']}: {concert_id}")

        seats = []
        for row in c["rows"]:
            for number in range(1, c["seats_per_row"] + 1):
                seat_id = await conn.fetchval("""
                    INSERT INTO seats (concert_id, row, number, status)
                    VALUES ($1, $2, $3, 'available')
                    ON CONFLICT DO NOTHING
                    RETURNING id
                """, concert_id, row, number)
                if seat_id:
                    seats.append({"row": row, "number": number, "id": str(seat_id)})

        # pre-book 2 seats so we can test "already booked" scenario
        booked_seats = []
        for seat in seats[:2]:
            await conn.execute("""
                UPDATE seats SET status = 'booked' WHERE id = $1
            """, uuid.UUID(seat["id"]))
            booked_seats.append(seat)

        print(f"   └─ {len(seats)} seats created, {len(booked_seats)} pre-booked (for conflict test)\n")

        all_data.append({
            "concert": c["name"],
            "concert_id": str(concert_id),
            "available_seat": seats[2] if len(seats) > 2 else None,   # first free seat
            "booked_seat": booked_seats[0] if booked_seats else None,  # already taken
        })

    # ── Print curl cheat sheet ─────────────────────────────────────────
    print("=" * 60)
    print("CURL CHEAT SHEET")
    print("=" * 60)

    for i, d in enumerate(all_data):
        user_id, username = USERS[i % len(USERS)]
        avail = d["available_seat"]
        booked = d["booked_seat"]

        print(f"\n📍 {d['concert']}")
        print(f"   concert_id : {d['concert_id']}")

        if avail:
            print(f"\n   ✅ Normal booking (should succeed) — user: {username}")
            print(f"""   curl -X POST http://localhost:8000/bookings \\
     -H "Content-Type: application/json" \\
     -d '{{
       "user_id": "{user_id}",
       "concert_id": "{d['concert_id']}",
       "seat_id": "{avail['id']}"
     }}'""")

        if booked:
            print(f"\n   ❌ Double booking (should fail) — seat {booked['row']}{booked['number']} pre-booked")
            print(f"""   curl -X POST http://localhost:8000/bookings \\
     -H "Content-Type: application/json" \\
     -d '{{
       "user_id": "{USERS[1][0]}",
       "concert_id": "{d['concert_id']}",
       "seat_id": "{booked['id']}"
     }}'""")

    print("\n" + "=" * 60)
    print("GET booking status")
    print("=" * 60)
    print("""
   curl http://localhost:8000/bookings/<booking_id>
""")

    await conn.close()
    print("✅ Seed complete")


if __name__ == "__main__":
    asyncio.run(seed())