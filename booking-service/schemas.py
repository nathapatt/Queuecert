"""Pydantic request/response schemas for booking-service."""

from uuid import UUID

from pydantic import BaseModel


class BookingRequest(BaseModel):
    user_id: UUID
    concert_id: UUID
    seat_id: UUID


class BookingResponse(BaseModel):
    booking_id: UUID
    status: str
    message: str
