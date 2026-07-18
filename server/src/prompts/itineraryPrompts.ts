/**
 * Prompts for Itinerary Agent
 */

export function getItineraryBatchPrompt(
  destination: string,
  travelers: number,
  hotel: string,
  category: string,
  attractions: string[],
  restaurants: string[],
  dailyBudget: number,
  arrivalTime: string,
  weatherSnippet: any[],
  batchDays: { day: number; date: string }[],
  totalDays: number,
  alreadyScheduledLocations: string[]
): string {
  const isTripStart = batchDays[0].day === 1;
  const isTripEnd = batchDays[batchDays.length - 1].day === totalDays;

  const scheduledSection = alreadyScheduledLocations.length > 0
    ? `\nALREADY SCHEDULED (do NOT repeat these locations/restaurants): ${alreadyScheduledLocations.join(', ')}`
    : '';

  return `Trip: ${destination} | Travelers: ${travelers} | Total Trip Duration: ${totalDays} days
Hotel: ${hotel} (${category} category)
Tourist Attractions available to schedule: ${attractions.join('; ')}
Restaurants available to schedule: ${restaurants.slice(0, 15).join(', ')}${scheduledSection}
Daily budget: ₹${dailyBudget} (excluding accommodation)
${isTripStart ? `Transport arrival (Day 1 only): ${arrivalTime}` : ''}
Weather: ${JSON.stringify(weatherSnippet)}

Generate the itinerary for ONLY these ${batchDays.length} day(s): ${batchDays.map(d => `Day ${d.day} (${d.date})`).join(', ')}.
Start day numbering from ${batchDays[0].day}.

IMPORTANT INSTRUCTIONS:
${isTripStart
  ? `- Since this batch includes Day 1, Day 1 MUST begin with arrival/check-in at ${hotel} around ${arrivalTime}, and then start sightseeing.`
  : `- Do NOT include arrival, airport/station transfer, or hotel check-in at the start of this batch (Day ${batchDays[0].day}). The traveler is already checked into ${hotel} and their trip is in progress.`
}
${isTripEnd
  ? `- Since this batch includes Day ${totalDays} (the final day), the last day MUST end with checking out from the hotel and departing/heading home.`
  : `- Do NOT include hotel checkout, departure, or heading home on the last day of this batch (Day ${batchDays[batchDays.length - 1].day}) because the trip continues after this batch.`
}
- DO NOT duplicate places or repeat locations that are in the "ALREADY SCHEDULED" list or scheduled earlier.
- Prefer live provider attractions when marked [google_places].
- If an attraction is marked [llm_recommendation], present it as a recommended visit, not a confirmed live listing.
- Spread attractions across days (don't repeat the same place).
- Include a suggested local transport note (cab, auto, etc.) for travel activities.
- IMPORTANT ROUTING RULE: Organize daily sightseeing schedules and group nearby locations geographically so that travel times from the chosen hotel (${hotel}) are minimized.
- In each schedule item, customize the 'transport_note' field to state the estimated distance and transit time/route from the hotel (e.g. '5.4 km NE of hotel - 12 mins via cab' or 'Walk 5 mins from hotel').`;
}

export function getItinerarySystemPrompt(): string {
  return `You are a travel itinerary planner. Return ONLY valid, complete JSON — no markdown fences, one line explanation.
Schema (STRICTLY follow this, closing ALL braces/brackets):
{
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "title": "Day title",
      "description": "A short, one-line summary description of this day's sightseeing and activities (max 15 words)",
      "schedule": [
        { "time": "HH:MM", "activity": "description", "location": "exact place name", "cost_inr": 500, "duration_min": 60, "transport_note": "By auto ₹60" }
      ],
      "daily_total_inr": 2000,
      "weather_note": "brief weather note"
    }
  ]
}
Include 4-6 schedule items per day. Keep activity descriptions concise (under 80 chars).
Always include a transport_note field for activities that require travel from hotel.
CRITICAL CONSTRAINT: You MUST construct the daily schedule items utilizing ONLY the provided 'Tourist Attractions' and 'Restaurants' for that city. Do NOT generate or create any other sightseeing places, landmarks, or dining venues that are not explicitly provided in the Tourist Attractions and Restaurants lists in the prompt. If you need additional events, allocate leisure time, hotel relaxation, or neighborhood walks, but do not hallucinate external attractions.`;
}
