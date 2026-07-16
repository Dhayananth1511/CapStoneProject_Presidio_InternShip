/**
 * Prompts for Activity Agent
 */

export function getActivityFallbackPrompt(
  destination: string,
  attractionCount: number,
  restaurantCount: number
): string {
  return `Return ONLY valid JSON for destination-aware travel recommendations when live provider data is unavailable.
Schema:
{
  "attractions": [{ "name": "string", "vicinity": "string", "rating": 4.2, "description": "1-sentence short description describing the place (max 12 words)" }],
  "restaurants": [{ "name": "string", "rating": 4.3, "price_level": 2 }]
}
Rules:
- Recommendations must fit ${destination}.
- Use exactly ${attractionCount} attractions and ${restaurantCount} restaurants.
- These are recommendations, not confirmed live listings.
- Avoid generic placeholders like City Center, Old Town, Culinary Hub.
- Keep names plausible and destination-specific.
- Suggest ONLY scenic, historic, cultural, recreational, or sightseeing tourist attractions. Do NOT suggest municipal utilities, government offices, emergency or transit hubs (e.g. police stations, fire stations, post offices, bus stands, or train stations).`;
}

export function getActivityEnrichmentPrompt(destination: string, names: string[]): string {
  return `For each tourist spot listed below in key-value structure, write a very short, appealing 1-sentence description (max 12 words) describing what it is or why people visit it.
Destination: ${destination}
Spots:
${names.map((n: string) => `- ${n}`).join('\n')}

Format your reply ONLY as a valid JSON object mapping spot name to description:
{
  "Spot Name 1": "Description here",
  "Spot Name 2": "Description here"
}`;
}

export function getActivityReasoningPrompt(destination: string, interests: string[], days: number): string {
  return `You are TripPlanner's Local Sightseeing & Activities Specialist Agent. 
Analyze the suggested places in ${destination} for a ${days}-day trip matching traveler interests: ${interests.join(', ')}.
Briefly explain if these matches fit traveler preferences, and highlight 2-3 key landmark recommendations in 2-3 sentences. Keep it short.`;
}

export function getActivityFilteringPrompt(destination: string): string {
  return `You are TripPlanner's Sightseeing & Activities Specialist. You are given a list of tourist attractions in or near ${destination} retrieved from a local directory.
Your task is to:
1. Filter this list to prioritize the most famous, popular, and scenic tourist/sightseeing spots in or very close to ${destination}.
2. Filter out any accommodations (hotels, resorts, stays, B&B), municipal utilities/offices, transit hubs (bus stations, railway stops), or unremarkable local shops/facilities.
3. Provide realistic ratings (1.0 to 5.0) and review counts (user_ratings_total) based on real-world popularity and fame of each attraction.
4. Provide a short description (max 12 words) for each.
5. If the directory list has fewer than 8 good tourist attractions, supplement the list with other famous sightseeing spots, historical landmarks, or monuments in ${destination} to always return at least 8-12 high-quality tourist choices.
6. Sort the final list in descending order of rating/popularity.

Format your reply ONLY as a valid JSON object of this structure:
{
  "attractions": [
    {
      "name": "Attraction Name",
      "vicinity": "Address or area, ${destination}",
      "rating": 4.8,
      "user_ratings_total": 2450,
      "description": "Short description here",
      "place_id": "original_place_id",
      "types": ["tourism.attraction"],
      "source_type": "geoapify_places" // preserve geoapify_places or set to llm_recommendation if you added/supplemented it
    }
  ]
}`;
}
