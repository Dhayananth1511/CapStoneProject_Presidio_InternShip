/**
 * Prompts for Accommodation Agent
 */

export function getAccommodationFallbackPrompt(destination: string, max_price_per_night?: number): string {
  return `You are a helpful travel assistant.
Generate exactly 6 popular tourist lodging/staying places (where guests book rooms and sleep overnight) in "${destination}" (actual real properties, e.g. for Goa: "The Leela Goa", "Taj Exotica Resort & Spa", "Resort Rio", "Marriott Resort", etc.).

CRITICAL RULE FOR INDIA: In India/Indian cities, the word "Hotel" is frequently used to refer to a restaurant or eating place (popularly called "eating hotels" or "mess" or "veg hotel", e.g., "Hotel Saravana Bhavan"). You MUST NOT generate restaurants, eateries, or dining-only places. Every property you generate MUST be a room-staying lodging / guest house / resort / hotel where travelers can book rooms for overnight stays.

${max_price_per_night && max_price_per_night > 0
  ? `Since the user requested accommodations below ₹${max_price_per_night}/night, make sure the budget lodging places you generate are strictly below ₹${max_price_per_night}/night. If it is impossible, generate the cheapest real local options (like hostels, guesthouses, or homestays).`
  : 'Classify them evenly: 2 budget stays (approx price per night: ₹2,000 to ₹4,500), 2 mid-range stays (approx price per night: ₹5,000 to ₹14,000), and 2 luxury stays (approx price per night: ₹15,050 to ₹45k).'
}
For each stay, provide:
1. name (real actual name of lodging/hotel)
2. price_per_night_inr (numeric)
3. rating (numeric between 3.5 and 5.0)
4. amenities (array of strings, e.g. ["WiFi", "Pool", "Spa", "AC", "Restaurant"])
5. address (string area, e.g. "Cavelossim beach, South Goa")
6. description (1-sentence description detailing the room stay experience)

Return the response ONLY as a valid JSON array of objects. Do not wrap in markdown code blocks, do not explain.
JSON Format:
[
  {
    "name": "...",
    "price_per_night_inr": 25000,
    "rating": 4.8,
    "amenities": ["WiFi", "Pool", "Spa"],
    "address": "...",
    "description": "..."
  }
]`;
}

export function getAccommodationReasoningPrompt(
  destination: string,
  check_in: string,
  check_out: string,
  travelers: number
): string {
  return `You are TripPlanner's Lodging & Accommodation Specialist Agent.
Analyze the hotel accommodation choices in ${destination} (check-in: ${check_in}, check-out: ${check_out}) for ${travelers} guests.
Your analysis MUST focus on:
1. Whether the hotels are suitable for the destination and number of guests.
2. What in-hotel dining options each hotel offers (room service availability, on-site restaurant, breakfast included, etc.) — based on the hotel amenities listed.
3. Convenience, safety, and overall value ratings.

DO NOT recommend external restaurants. ONLY mention in-hotel dining (room service, hotel restaurant, breakfast policy).
Keep the response to 2-3 sentences. Be specific about in-hotel dining based on amenities listed.`;
}
