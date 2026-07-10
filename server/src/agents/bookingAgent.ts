// Booking Agent (Mocked) — simulates completing reservations after HITL approval.
// In a real system, this would call OYO Rooms API, MakeMyTrip API, etc.
// Booking is the final irreversible step, only triggered after user approval.

import { mockBooking } from '../mcp-servers/bookingMCP';
import { createCalendarEvent } from '../mcp-servers/calendarMCP';
import { TripContext } from './plannerAgent';

export async function runBookingAgent(
  context: TripContext,
  userEmail: string
): Promise<{ bookingRefs: any; confirmed: boolean }> {
  // Mock hotel booking
  const hotelBooking = await mockBooking(
    context.accommodation?.recommended || 'Selected Hotel',
    context.input.travelers || 1
  );

  // Create Google Calendar events for the trip dates (uses real calendarMCP)
  const calendarResult = await createCalendarEvent(
    context.input.destination || 'India Tour',
    context.input.start_date!,
    context.input.end_date!,
    userEmail
  );

  return {
    bookingRefs: {
      hotel: hotelBooking.booking_ref,
      calendar: calendarResult.eventId || 'No calendar synced',
      transport: `TR${Date.now().toString(36).toUpperCase()}`, // Mock transport reference
    },
    confirmed: hotelBooking.status === 'CONFIRMED',
  };
}
