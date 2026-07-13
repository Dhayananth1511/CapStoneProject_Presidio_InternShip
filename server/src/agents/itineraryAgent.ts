// Itinerary Agent — builds the day-by-day schedule. It's the most complex agent
// because it must weave together weather advisories, activity timings, meal breaks,
// check-in/out times, and daily spending caps into a coherent schedule.
//
// BATCHING STRATEGY: We generate at most 5 days per LLM call to prevent the
// model from truncating its JSON output mid-stream (which causes parse failures
// on longer trips). Results are merged into one consolidated itinerary.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.3-70b-versatile', // Better reasoning for complex day-by-day JSON schedules
  temperature: 0.3, // Lower temp = more deterministic JSON
  maxTokens: 4096,  // Explicit cap per call to prevent runaway responses
});

/** Generates a single itinerary batch for a slice of dates. */
async function generateBatch(
  batchDays: { day: number; date: string }[],
  context: TripContext,
  dailyBudget: number
): Promise<any[]> {
  const { input, weather, transport, accommodation, activities } = context;

  // Find matching weather for these dates
  const weatherSnippet = batchDays.map(d =>
    (weather?.forecast || []).find((f: any) => f.date === d.date) || { date: d.date, condition: 'Mixed', temp_high_c: 28, temp_low_c: 22 }
  );

  const batchPrompt = `Trip: ${input.destination} | Travelers: ${input.travelers}
Hotel: ${accommodation?.recommended || 'Hotel'}
Attractions: ${(activities?.attractions || []).slice(0, 10).join(', ')}
Restaurants: ${(activities?.restaurants || []).slice(0, 6).join(', ')}
Daily budget: ₹${dailyBudget}
Transport arrival (Day 1 only): ${transport?.options?.[0]?.arrival || '14:00'}
Weather: ${JSON.stringify(weatherSnippet)}

Generate the itinerary for ONLY these ${batchDays.length} day(s): ${batchDays.map(d => `Day ${d.day} (${d.date})`).join(', ')}.
Start day numbering from ${batchDays[0].day}.`;

  const systemPrompt = `You are a travel itinerary planner. Return ONLY valid, complete JSON — no markdown fences, no explanation.
Schema (STRICTLY follow this, closing ALL braces/brackets):
{
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "title": "Day title",
      "schedule": [
        { "time": "HH:MM", "activity": "description", "location": "place name", "cost_inr": 500, "duration_min": 60 }
      ],
      "daily_total_inr": 2000,
      "weather_note": "brief weather note"
    }
  ]
}
Include 4-6 schedule items per day. Keep activity descriptions concise (under 80 chars).`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await withRetry(
        () => llm.invoke([new SystemMessage(systemPrompt), new HumanMessage(batchPrompt)]),
        { maxRetries: 4, timeout: 45000 } // Extended timeout for itinerary
      );

      const raw = response.content.toString().trim();
      // Strip any markdown fences the model might add despite instructions
      const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in response');

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed.days) || parsed.days.length === 0) {
        throw new Error('Parsed itinerary has empty days array');
      }
      return parsed.days;
    } catch (err: any) {
      logger.warn(`Itinerary batch (days ${batchDays[0].day}-${batchDays[batchDays.length-1].day}) attempt ${attempt}/2 failed`, { error: err.message });
      if (attempt === 2) {
        // Return a minimal fallback for this batch rather than killing the whole trip
        return batchDays.map(d => ({
          day: d.day,
          date: d.date,
          title: `Day ${d.day} — ${input.destination}`,
          schedule: [
            { time: '09:00', activity: 'Morning exploration', location: input.destination, cost_inr: 500, duration_min: 120 },
            { time: '13:00', activity: 'Lunch at local restaurant', location: input.destination, cost_inr: 400, duration_min: 60 },
            { time: '15:00', activity: 'Sightseeing & local activities', location: input.destination, cost_inr: 600, duration_min: 180 },
            { time: '19:00', activity: 'Dinner & evening leisure', location: accommodation?.recommended || 'Hotel', cost_inr: 500, duration_min: 90 },
          ],
          daily_total_inr: 2000,
          weather_note: 'Check local conditions before heading out.',
        }));
      }
    }
  }
  return [];
}

export async function runItineraryAgent(context: TripContext): Promise<{ days: any[]; notes: string }> {
  const { input, budget } = context;

  // Build the list of all trip days
  const startDate = new Date(input.start_date || new Date());
  const endDate = new Date(input.end_date || new Date());
  const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const dailyBudget = Math.round((budget?.remaining_budget_inr || 10000) / totalDays);

  const allDays: { day: number; date: string }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    allDays.push({ day: i + 1, date: d.toISOString().split('T')[0] });
  }

  // Split into batches of ≤5 days to keep the LLM response small & valid
  const BATCH_SIZE = 5;
  const batches: { day: number; date: string }[][] = [];
  for (let i = 0; i < allDays.length; i += BATCH_SIZE) {
    batches.push(allDays.slice(i, i + BATCH_SIZE));
  }

  logger.info(`Itinerary Agent: generating ${totalDays} days in ${batches.length} batch(es)`, { destination: input.destination });

  // Generate batches sequentially to avoid rate-limit spikes from parallel calls
  const allGeneratedDays: any[] = [];
  for (const batch of batches) {
    const days = await generateBatch(batch, context, dailyBudget);
    allGeneratedDays.push(...days);
  }

  return {
    days: allGeneratedDays,
    notes: `${totalDays}-day trip to ${input.destination}. Budget ≈₹${dailyBudget}/day. Book accommodations and transport well in advance.`,
  };
}
