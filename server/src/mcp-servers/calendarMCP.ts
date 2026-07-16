// Calendar MCP Server — REAL Google Calendar sync using official googleapis SDK
// Integrates OAuth2 client to insert travel block events in the user's primary calendar.
// If the user's Google account is not connected, it skips calendar sync gracefully without error.

import { google } from 'googleapis';
import { withRetry } from '../utils/retry';
import User from '../models/User';

// Initialize the Google OAuth2 client with credentials from environmental configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CALENDAR_CLIENT_ID,
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
);

export async function createCalendarEvent(
  tripName: string,
  start_date: string,
  end_date: string,
  userEmail: string,
  googleTokens?: { access_token?: string; refresh_token?: string }
): Promise<{ success: boolean; eventId?: string; message: string }> {
  return withRetry(async () => {
    let tokens = googleTokens;

    // 1. If tokens are not supplied directly, fetch them from the User record in DB
    if (!tokens) {
      const user = await User.findOne({ email: userEmail });
      if (user && user.googleRefreshToken) {
        tokens = {
          access_token: user.googleAccessToken,
          refresh_token: user.googleRefreshToken,
        };
      }
    }

    // 2. Graceful escape if user hasn't authed Google account
    if (!tokens || !tokens.refresh_token) {
      return {
        success: false,
        message: `Google account is not linked. Skipped syncing "${tripName}" to Google Calendar.`,
      };
    }

    // 3. Bind refresh/access credentials to client
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 4. Construct Calendar Event schema
    const event = {
      summary: `✈️ Trip to ${tripName}`,
      description: `Travel Planner AI generated itinerary.\n\nFrom: ${start_date}\nTo: ${end_date}\nEnjoy your journey!`,
      start: {
        date: start_date, // Daily block event YYYY-MM-DD
        timeZone: 'Asia/Kolkata',
      },
      end: {
        date: end_date, // Daily block event YYYY-MM-DD
        timeZone: 'Asia/Kolkata',
      },
      attendees: [{ email: userEmail }],
    };

    // 5. Connect and insert
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    return {
      success: true,
      eventId: response.data.id || undefined,
      message: `Calendar event "${tripName}" successfully created in Google Calendar.`,
    };
  });
}
