// Seeded attendees (matches app/seed.py) and an offline demo dataset so the
// page still looks alive when the booking-service isn't running.

import type { Concert, Seat } from './api'

export type Attendee = {
  id: string
  name: string
  email: string
  initials: string
}

export const ATTENDEES: Attendee[] = [
  { id: 'a3f1b2c4-7d8e-4a9f-b6c1-2e3d4f5a6b7c', name: 'Alice', email: 'alice@example.com', initials: 'AL' },
  { id: 'b8e2d4f6-1c3a-4e5b-9d7f-8a6c2e4b1d3f', name: 'Bob', email: 'bob@example.com', initials: 'BO' },
  { id: 'c5d9e7a1-3b6f-4c8d-a2e4-7f1b9d3c5a8e', name: 'Charlie', email: 'charlie@example.com', initials: 'CH' },
]

// Poster art accents keyed by concert name (falls back to a rotating palette).
export const POSTERS: Record<string, { hue: string; tag: string }> = {
  'BTS World Tour': { hue: '#7b5cff', tag: 'K-POP / STADIUM' },
  'BLACKPINK Born Pink': { hue: '#ff3d8b', tag: 'K-POP / ARENA' },
  'Coldplay Music of the Spheres': { hue: '#00b3a4', tag: 'ROCK / STADIUM' },
}

export const FALLBACK_PALETTE = ['#ff5a1f', '#2563ff', '#16a34a', '#d4145a', '#7b5cff']

// --- Offline demo data (only used when the API is unreachable) -------------

export const DEMO_CONCERTS: Concert[] = [
  { id: 'demo-bts', name: 'BTS World Tour', venue: 'Impact Arena Bangkok', event_date: '2025-12-01T19:00:00+07:00' },
  { id: 'demo-bp', name: 'BLACKPINK Born Pink', venue: 'Royal Paragon Hall', event_date: '2025-12-15T18:00:00+07:00' },
  { id: 'demo-cp', name: 'Coldplay Music of the Spheres', venue: 'Rajamangala Stadium', event_date: '2026-01-10T20:00:00+07:00' },
]

export function demoSeats(concertId: string): Seat[] {
  const rows = ['A', 'B', 'C', 'D']
  const perRow = 10
  const seats: Seat[] = []
  let i = 0
  for (const row of rows) {
    for (let n = 1; n <= perRow; n++) {
      // deterministic-ish spread of taken seats for visual interest
      const taken = (i * 7 + concertId.length * 3) % 11 === 0
      const locked = (i * 5 + 2) % 17 === 0
      seats.push({
        id: `${concertId}-${row}${n}`,
        row,
        number: n,
        status: taken ? 'booked' : locked ? 'locked' : 'available',
      })
      i++
    }
  }
  return seats
}
