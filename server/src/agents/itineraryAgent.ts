// Itinerary Agent — builds the day-by-day schedule using real tourist locations.
// Weaves together weather advisories, meal breaks, check-in/out times, and daily spending caps.
//
// BATCHING STRATEGY: We generate at most 5 days per LLM call to prevent the
// model from truncating its JSON output mid-stream (which causes parse failures
// on longer trips). Results are merged into one consolidated itinerary.

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';
import { createChatModel } from '../utils/llm';
import { getItineraryBatchPrompt, getItinerarySystemPrompt } from '../prompts';

const llm = createChatModel({
  temperature: 0.3,
  maxTokens: 4096,
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
    (weather?.forecast || []).find((f: any) => f.date === d.date) || { date: d.date, condition: 'Clear', temp_high_c: 28, temp_low_c: 22 }
  );

  // Build a structured list of attractions from activities data
  const realAttractions = (activities?.attraction_options || []) as any[];

  // Create enriched attraction info: name + rating + vicinity + source
  const enrichedAttractions = realAttractions.map((attr: any) => ({
    name: attr.name,
    rating: attr.rating || 4.0,
    vicinity: attr.vicinity || input.destination,
    source_type: attr.source_type || 'google_places',
  })).filter((a: any) => a.name);

  // Fallback: use simple attraction names if no enriched data
  const attractionsForPrompt = enrichedAttractions.length > 0
    ? enrichedAttractions.slice(0, 30).map((a: any) => `${a.name} (${a.rating}★) [${a.source_type}]`)
    : (activities?.attractions || []).slice(0, 30);

  const batchPrompt = getItineraryBatchPrompt(
    input.destination || '',
    input.travelers || 0,
    accommodation?.recommended || 'Hotel',
    accommodation?.selected_category || 'mid_range',
    attractionsForPrompt,
    activities?.restaurants || [],
    dailyBudget,
    (transport as any)?.options?.[0]?.arrival || '14:00',
    weatherSnippet,
    batchDays
  );

  const systemPrompt = getItinerarySystemPrompt();

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await withRetry(
        () => llm.invoke([new SystemMessage(systemPrompt), new HumanMessage(batchPrompt)]),
        { maxRetries: 4, timeout: 45000 }
      );

      const raw = response.content.toString().trim();
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
        // Return minimal fallback with available provider or recommendation names
        const fallbackAttractions = ((activities?.attraction_options || []) as any[]).map((item: any) => ({
          name: item.name,
          source_type: item.source_type || 'google_places',
        }));
        return batchDays.map((d, idx) => ({
          day: d.day,
          date: d.date,
          title: `Day ${d.day} — ${input.destination}`,
          description: `Savor the best local sightseeing and dining hotspots around ${input.destination}.`,
          schedule: [
            { time: '09:00', activity: fallbackAttractions[idx * 2] ? `${fallbackAttractions[idx * 2].source_type === 'llm_recommendation' ? 'Recommended visit' : 'Visit'} ${fallbackAttractions[idx * 2].name}` : 'Morning exploration', location: fallbackAttractions[idx * 2]?.name || input.destination, cost_inr: 200, duration_min: 120, transport_note: 'By auto ₹60' },
            { time: '13:00', activity: 'Lunch at local restaurant', location: (activities?.restaurants || [])[0] || input.destination, cost_inr: 400, duration_min: 60 },
            { time: '15:00', activity: fallbackAttractions[idx * 2 + 1] ? `${fallbackAttractions[idx * 2 + 1].source_type === 'llm_recommendation' ? 'Recommended explore' : 'Explore'} ${fallbackAttractions[idx * 2 + 1].name}` : 'Sightseeing & local activities', location: fallbackAttractions[idx * 2 + 1]?.name || input.destination, cost_inr: 300, duration_min: 180, transport_note: 'By cab ₹150' },
            { time: '19:00', activity: 'Dinner & evening leisure', location: (activities?.restaurants || [])[1] || accommodation?.recommended || 'Hotel', cost_inr: 500, duration_min: 90 },
          ],
          daily_total_inr: 1800,
          weather_note: 'Check local conditions before heading out.',
        }));
      }
    }
  }
  return [];
}

export async function runItineraryAgent(context: TripContext): Promise<{ days: any[]; notes: string }> {
  const { input, budget, activities, accommodation } = context;

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

  // Split into batches of ≤5 days
  const BATCH_SIZE = 5;
  const batches: { day: number; date: string }[][] = [];
  for (let i = 0; i < allDays.length; i += BATCH_SIZE) {
    batches.push(allDays.slice(i, i + BATCH_SIZE));
  }

  logger.info(`Itinerary Agent: generating ${totalDays} days in ${batches.length} batch(es)`, { destination: input.destination });

  const allGeneratedDays: any[] = [];
  for (const batch of batches) {
    const days = await generateBatch(batch, context, dailyBudget);
    allGeneratedDays.push(...days);
  }

  // Build summary notes
  const attractionCount = (activities?.attractions || []).length;
  const hotelName = accommodation?.recommended || 'Accommodation';

  return {
    days: allGeneratedDays,
    notes: `${totalDays}-day trip to ${input.destination}. Staying at ${hotelName}. Budget ≈₹${dailyBudget}/day. ${attractionCount} tourist spots covered. Book accommodations and transport well in advance.`,
  };
}

