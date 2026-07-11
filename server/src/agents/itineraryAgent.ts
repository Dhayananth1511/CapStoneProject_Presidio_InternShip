// Itinerary Agent — builds the day-by-day schedule. It's the most complex agent
// because it must weave together weather advisories, activity timings, meal breaks,
// check-in/out times, and daily spending caps into a coherent schedule.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.3-70b-versatile', // Bigger model for complex scheduling task
  temperature: 0.4,
});

export async function runItineraryAgent(context: TripContext): Promise<{ days: any[]; notes: string }> {
  const { input, weather, transport, accommodation, activities, budget } = context;

  const promptHuman = `Trip: ${input.destination} | Dates: ${input.start_date} to ${input.end_date}
       Travelers: ${input.travelers} | Budget left per day: ₹${Math.round((budget?.remaining_budget_inr || 5000) / 5)}
       Attractions: ${activities?.attractions?.join(', ')}
       Restaurants: ${activities?.restaurants?.join(', ')}
       Hotel: ${accommodation?.recommended || 'Hotel'}
       Weather: ${JSON.stringify(weather?.forecast?.slice(0, 3))}
       Transport arrival: ${transport?.options?.[0]?.arrival || '14:00'}`;

  // Attempt itinerary generation up to 2 times before falling back
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await withRetry(() => llm.invoke([
      new SystemMessage(
        `You are a travel itinerary planner. Create a detailed day-by-day itinerary.
         Return ONLY valid JSON:
         {
           "days": [
             {
               "day": 1,
               "date": "YYYY-MM-DD",
               "title": "Day title",
               "schedule": [
                 { "time": "HH:MM", "activity": "description", "location": "place", "cost_inr": 0, "duration_min": 60 }
               ],
               "daily_total_inr": 0,
               "weather_note": "weather consideration"
             }
           ],
           "notes": "general trip tips"
         }`
      ),
      new HumanMessage(promptHuman),
    ]));

    try {
      const jsonMatch = response.content.toString().match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON block found in itinerary response');
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.days || !Array.isArray(parsed.days) || parsed.days.length === 0) {
        throw new Error('Itinerary response had empty or missing days array');
      }
      return parsed;
    } catch (err: any) {
      logger.warn(`Itinerary Agent JSON parse failed (attempt ${attempt}/2)`, { error: err.message });
      if (attempt === 2) {
        // After both attempts fail, return a graceful fallback with a clear note
        return {
          days: [{ day: 1, title: 'Day 1 - Arrival & Check-In', date: input.start_date || '', schedule: [], daily_total_inr: 0, weather_note: 'Check local conditions on arrival.' }],
          notes: '⚠️ Detailed schedule generation encountered an issue. Your trip is saved — use "Reject & Replan" in the chat to regenerate the itinerary.',
        };
      }
    }
  }

  // TypeScript requires a return here — unreachable in practice
  return { days: [], notes: '' };
}

