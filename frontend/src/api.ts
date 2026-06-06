// Thin client for the Queuecert booking-service.
// Base URL is configurable via VITE_API_URL, defaults to the local dev port.

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export type Concert = {
  id: string
  name: string
  venue: string
  event_date: string
}

export type SeatStatus = 'available' | 'locked' | 'booked'

export type Seat = {
  id: string
  row: string
  number: number
  status: SeatStatus
}

export type BookingResponse = {
  booking_id: string
  status: 'pending' | 'confirmed' | 'failed'
  message: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (body?.detail) detail = body.detail
    } catch {
      /* ignore non-json bodies */
    }
    throw new ApiError(detail, res.status)
  }
  return res.json() as Promise<T>
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const api = {
  health: () => req<{ status: string }>('/health'),
  concerts: () => req<Concert[]>('/concerts'),
  seats: (concertId: string) => req<Seat[]>(`/concerts/${concertId}/seats`),
  book: (body: { user_id: string; concert_id: string; seat_id: string }) =>
    req<BookingResponse>('/bookings', { method: 'POST', body: JSON.stringify(body) }),
  booking: (id: string) => req<BookingResponse>(`/bookings/${id}`),
}
