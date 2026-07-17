// Itinerary Agent — builds the day-by-day schedule using real tourist locations.
// Weaves together weather advisories, meal breaks, check-in/out times, and daily spending caps.
//
// BATCHING STRATEGY: We generate at most 5 days per LLM call to prevent the
// model from truncating its JSON output mid-stream (which causes parse failures
// on longer trips). Results are merged into one consolidated itinerary.

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from '../types';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';
import { createChatModel } from '../utils/llm';
import { getItineraryBatchPrompt, getItinerarySystemPrompt } from '../prompts';
import { extractJsonObject } from '../utils/jsonHelpers';
import { calculateNights } from '../utils/dateHelpers';


const llm = createChatModel({
  temperature: 0.3,
  maxTokens: 4096,
});

/** Generates a single itinerary batch for a slice of dates. */
async function generateBatch(
  batchDays: { day: number; date: string }[],
  context: TripContext,
  dailyBudget: number,
  totalDays: number,
  alreadyScheduledLocations: string[]
): Promise<any[]> {
  const { input, weather, transport, accommodation, activities } = context;

  // Find matching weather for these dates
  const weatherSnippet = batchDays.map(d =>
    (weather?.forecast || []).find((f: any) => f.date === d.date) || { date: d.date, condition: 'Clear', temp_high_c: 28, temp_low_c: 22 }
  );

  // Normalize helper to compare places case-insensitively/partially
  const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const scheduledNormalized = alreadyScheduledLocations.map(normalize);

  // Build a structured list of attractions from activities data
  const realAttractions = (activities?.attraction_options || []) as any[];

  // Create enriched attraction info: name + rating + vicinity + source
  const enrichedAttractions = realAttractions
    .map((attr: any) => ({
      name: attr.name,
      rating: attr.rating || 4.0,
      vicinity: attr.vicinity || input.destination,
      source_type: attr.source_type || 'google_places',
    }))
    .filter((a: any) => a.name && !scheduledNormalized.includes(normalize(a.name)));

  // Fallback: use simple attraction names if no enriched data (filtered by scheduled)
  const fallbackAttractionsList = (activities?.attractions || [])
    .filter((name: string) => !scheduledNormalized.includes(normalize(name)));

  let attractionsForPrompt = enrichedAttractions.length > 0
    ? enrichedAttractions.slice(0, 30).map((a: any) => `${a.name} (${a.rating}★) [${a.source_type}]`)
    : fallbackAttractionsList.slice(0, 30);

  // If we ran out of attractions entirely, recycle the original list
  if (attractionsForPrompt.length === 0) {
    const originalEnriched = realAttractions.map((attr: any) => ({
      name: attr.name,
      rating: attr.rating || 4.0,
      vicinity: attr.vicinity || input.destination,
      source_type: attr.source_type || 'google_places',
    })).filter((a: any) => a.name);
    
    attractionsForPrompt = originalEnriched.length > 0
      ? originalEnriched.slice(0, 30).map((a: any) => `${a.name} (${a.rating}★) [${a.source_type}]`)
      : (activities?.attractions || []).slice(0, 30);
  }

  // Filter restaurants as well
  const allRestaurants = (activities?.restaurants || []) as string[];
  const remainingRestaurants = allRestaurants.filter(
    (r: string) => !scheduledNormalized.includes(normalize(r))
  );

  let restaurantsForPrompt = remainingRestaurants;
  if (restaurantsForPrompt.length === 0) {
    restaurantsForPrompt = allRestaurants;
  }

  const batchPrompt = getItineraryBatchPrompt(
    input.destination || '',
    input.travelers || 0,
    accommodation?.recommended || 'Hotel',
    accommodation?.selected_category || 'mid_range',
    attractionsForPrompt,
    restaurantsForPrompt,
    dailyBudget,
    (transport as any)?.options?.[0]?.arrival || '14:00',
    weatherSnippet,
    batchDays,
    totalDays,
    alreadyScheduledLocations
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
      const parsed = extractJsonObject(cleaned);
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
        return batchDays.map((d) => {
          // Use absolute day-based indexing to avoid duplicates in manual fallback
          const idx1 = ((d.day - 1) * 2) % (fallbackAttractions.length || 1);
          const idx2 = (((d.day - 1) * 2) + 1) % (fallbackAttractions.length || 1);

          return {
            day: d.day,
            date: d.date,
            title: `Day ${d.day} — ${input.destination}`,
            description: `Savor the best local sightseeing and dining hotspots around ${input.destination}.`,
            schedule: [
              { time: '09:00', activity: fallbackAttractions[idx1] ? `${fallbackAttractions[idx1].source_type === 'llm_recommendation' ? 'Recommended visit' : 'Visit'} ${fallbackAttractions[idx1].name}` : 'Morning exploration', location: fallbackAttractions[idx1]?.name || input.destination, cost_inr: 200, duration_min: 120, transport_note: 'By auto ₹60' },
              { time: '13:00', activity: 'Lunch at local restaurant', location: (activities?.restaurants || [])[d.day % (activities?.restaurants?.length || 1)] || input.destination, cost_inr: 400, duration_min: 60 },
              { time: '15:00', activity: fallbackAttractions[idx2] ? `${fallbackAttractions[idx2].source_type === 'llm_recommendation' ? 'Recommended explore' : 'Explore'} ${fallbackAttractions[idx2].name}` : 'Sightseeing & local activities', location: fallbackAttractions[idx2]?.name || input.destination, cost_inr: 300, duration_min: 180, transport_note: 'By cab ₹150' },
              { time: '19:00', activity: 'Dinner & evening leisure', location: (activities?.restaurants || [])[(d.day + 1) % (activities?.restaurants?.length || 1)] || accommodation?.recommended || 'Hotel', cost_inr: 500, duration_min: 90 },
            ],
            daily_total_inr: 1800,
            weather_note: 'Check local conditions before heading out.',
          };
        });
      }
    }
  }
  return [];
}

export async function runItineraryAgent(context: TripContext): Promise<{ days: any[]; notes: string }> {
  const { input, budget, activities, accommodation } = context;

  // Build the list of all trip days
  const startDate = new Date(input.start_date || new Date());
  const totalDays = calculateNights(input.start_date, input.end_date) + 1;
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
  const alreadyScheduledLocations: string[] = [];

  for (const batch of batches) {
    const days = await generateBatch(batch, context, dailyBudget, totalDays, alreadyScheduledLocations);
    allGeneratedDays.push(...days);

    // Extract newly scheduled locations to avoid duplication in subsequent batches
    for (const day of days) {
      if (Array.isArray(day.schedule)) {
        for (const item of day.schedule) {
          const loc = (item.location || '').trim();
          if (loc) {
            const isHotelLocation =
              loc.toLowerCase().includes('hotel') ||
              loc.toLowerCase().includes('resort') ||
              loc.toLowerCase().includes('check-in') ||
              loc.toLowerCase().includes('stay') ||
              loc.toLowerCase() === (accommodation?.recommended || '').toLowerCase();
            if (!isHotelLocation) {
              alreadyScheduledLocations.push(loc);
            }
          }
        }
      }
    }
  }

  // Build summary notes
  const attractionCount = (activities?.attractions || []).length;
  const hotelName = accommodation?.recommended || 'Accommodation';

  return {
    days: allGeneratedDays,
    notes: `${totalDays}-day trip to ${input.destination}. Staying at ${hotelName}. Budget ≈₹${dailyBudget}/day. ${attractionCount} tourist spots covered. Book accommodations and transport well in advance.`,
  };
}

