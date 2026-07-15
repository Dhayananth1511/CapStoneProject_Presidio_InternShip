// Booking Agent — handles calendar scheduling post-approval.
// In a real production deployment, this would invoke real-world GDS / travel booking API integrations.

import { createCalendarEvent } from '../mcp-servers/calendarMCP';
import { TripContext } from './plannerAgent';

export async function runBookingAgent(
  context: TripContext,
  userEmail: string
): Promise<{ bookingRefs: any; confirmed: boolean }> {
  let calendarEventId = 'No calendar synced';

  // Create Google Calendar events for the trip dates (uses real calendarMCP)
  try {
    const calendarResult = await createCalendarEvent(
      context.input.destination || 'India Tour',
      context.input.start_date!,
      context.input.end_date!,
      userEmail
    );
    if (calendarResult.success && calendarResult.eventId) {
      calendarEventId = calendarResult.eventId;
    }
  } catch (calendarErr) {
    console.error('Gracefully skipped Google Calendar event creation due to integration/auth error:', calendarErr);
  }

  const selectedHotelName = context.accommodation?.selected_hotel?.name || context.accommodation?.recommended || 'Cozy Lodge';
  const selectedTransportOption = context.transport?.selected_option || context.transport?.options?.[0];
  const transportMode = selectedTransportOption?.mode || 'Train';
  const transportOperator = selectedTransportOption?.operator || 'Indian Railways';

  // Generate realistic confirmation reference codes based on selection
  const cleanHotel = String(selectedHotelName).replace(/[^A-Za-z0-9]/g, '');
  const hotelRef = `HB-HTL-${(cleanHotel || 'HTL').substring(0, 4).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;

  const cleanMode = String(transportMode).replace(/[^A-Za-z0-9]/g, '');
  const cleanOperator = String(transportOperator).replace(/[^A-Za-z0-9]/g, '');
  const transportRef = `PNR-${(cleanMode || 'TRN').substring(0, 3).toUpperCase()}-${(cleanOperator || 'OPR').substring(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;

  return {
    bookingRefs: {
      hotel: hotelRef,
      calendar: calendarEventId,
      transport: transportRef,
    },
    confirmed: true,
  };
}
