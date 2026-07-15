// Activity Agent — search local attractions and restaurants.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { searchHotelbedsActivities } from '../mcp-servers/hotelbedsActivitiesMCP';
import { getPlacesNearby } from '../mcp-servers/mapsMCP';
import { isHotelbedsConfigured } from '../mcp-servers/hotelbedsClient';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant',
  temperature: 0.3,
});

function extractJsonObject(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in LLM recommendation fallback');
  return JSON.parse(match[0]);
}

async function generateRecommendationFallback(destination: string, interests: string[], days: number) {
  const attractionCount = Math.max(8, Math.min(30, days * 4));
  const restaurantCount = Math.max(6, Math.min(20, days * 3));
  const fallbackPrompt = `Return ONLY valid JSON for destination-aware travel recommendations when live provider data is unavailable.
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
- Keep names plausible and destination-specific.`;

  const response = await withRetry(() => llm.invoke([
    new SystemMessage(fallbackPrompt),
    new HumanMessage(`Destination: ${destination}\nInterests: ${interests.join(', ') || 'general sightseeing'}\nTrip days: ${days}`),
  ]));

  const parsed = extractJsonObject(response.content.toString());
  const attractions = Array.isArray(parsed.attractions) ? parsed.attractions : [];
  const restaurants = Array.isArray(parsed.restaurants) ? parsed.restaurants : [];

  return {
    attractions: attractions.map((item: any) => item.name).filter(Boolean),
    restaurants: restaurants.map((item: any) => item.name).filter(Boolean),
    attraction_options: attractions.map((item: any, idx: number) => ({
      name: item.name,
      rating: item.rating || 4.0,
      user_ratings_total: 0,
      photo_reference: null,
      place_id: `llm-rec-attraction-${idx}`,
      vicinity: item.vicinity || destination,
      description: item.description || `A popular sightseeing attraction in ${destination}.`,
      types: ['recommendation'],
      source_type: 'llm_recommendation',
      is_llm_recommended: true,
    })),
    restaurant_options: restaurants.map((item: any, idx: number) => ({
      name: item.name,
      rating: item.rating || 4.0,
      price_level: item.price_level,
      user_ratings_total: 0,
      source_type: 'llm_recommendation',
      place_id: `llm-rec-restaurant-${idx}`,
      is_llm_recommended: true,
    })),
    timings: 'Recommendation-only; verify locally',
    entry_fees: 'Recommendation-only; verify locally',
    source_status: 'llm_recommendation',
  };
}

export const activityTool = tool(
  async ({ destination, interests, days, travelers }) => {
    logger.debug('Activity tool fetching from MCP', { destination, interests, days });
    let data: any;
    try {
      if (isHotelbedsConfigured('activities')) {
        const hbData = await searchHotelbedsActivities(destination, interests, days, travelers || 1);
        const nearby = await getPlacesNearby(destination, interests, days);
        const hbAttractions = (hbData.hotelbeds_activities || []).map((act: any) => ({
          name: act.name,
          rating: act.rating || 4.5,
          rating_count: 50,
          user_ratings_total: 50,
          vicinity: `Hotelbeds Activity (${act.categories?.join(', ') || 'Sightseeing'})`,
          photo_reference: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=600&q=80',
          price_per_person_inr: act.price_per_person_inr,
        }));
        data = {
          ...hbData,
          restaurants: nearby.restaurants,
          restaurant_options: (nearby as any).restaurant_options || [],
          attraction_options: [...hbAttractions, ...((nearby as any).attraction_options || [])],
          timings: nearby.timings,
          source_status: 'hotelbeds_activities',
        };
      } else {
        throw new Error('Hotelbeds activities are not configured.');
      }
    } catch (err: any) {
      logger.warn(`Hotelbeds activities lookup bypassed or failed, falling back to Google Places: ${err.message}`);
      data = await getPlacesNearby(destination, interests, days);
    }

    const hasLivePlaces = Array.isArray(data?.attraction_options) && data.attraction_options.length > 0;
    if (!hasLivePlaces) {
      try {
        const recommendationData = await generateRecommendationFallback(destination, interests, days);
        data = {
          ...data,
          ...recommendationData,
        };
      } catch (fallbackError) {
        logger.error('Activity Agent recommendation fallback failed', fallbackError);
      }
    }

    // Enrich attractions list with descriptions using LLM if descriptions are omitted/blank
    if (Array.isArray(data?.attraction_options) && data.attraction_options.length > 0) {
      try {
        const names = data.attraction_options.filter((item: any) => !item.description).map((item: any) => item.name);
        if (names.length > 0) {
          const enrichmentPrompt = `For each tourist spot listed below in key-value structure, write a very short, appealing 1-sentence description (max 12 words) describing what it is or why people visit it.
Destination: ${destination}
Spots:
${names.map((n: string) => `- ${n}`).join('\n')}

Format your reply ONLY as a valid JSON object mapping spot name to description:
{
  "Spot Name 1": "Description here",
  "Spot Name 2": "Description here"
}`;

          const enrichmentRes = await withRetry(() => llm.invoke([
            new SystemMessage(enrichmentPrompt),
          ]));
          
          let enrichText = enrichmentRes.content.toString().trim();
          if (enrichText.startsWith("```json")) {
             enrichText = enrichText.substring(7);
          }
          if (enrichText.startsWith("```")) {
             enrichText = enrichText.substring(3);
          }
          if (enrichText.endsWith("```")) {
            enrichText = enrichText.substring(0, enrichText.length - 3);
          }
          enrichText = enrichText.trim();
          const descriptions = JSON.parse(enrichText);
          
          data.attraction_options = data.attraction_options.map((item: any) => ({
            ...item,
            description: item.description || descriptions[item.name] || `A popular local attraction in ${destination}.`
          }));
        } else {
          data.attraction_options = data.attraction_options.map((item: any) => ({
            ...item,
            description: item.description || `A popular local attraction in ${destination}.`
          }));
        }
      } catch (enrichErr) {
        logger.error('Failed to enrich attraction descriptions', enrichErr);
        data.attraction_options = data.attraction_options.map((item: any) => ({
          ...item,
          description: item.description || `A popular local attraction in ${destination}.`
        }));
      }
    } else {
      data = data || {};
      data.attraction_options = [];
    }

    // Standalone LLM Reasoning Phase
    let reasoning = '';
    try {
      const systemPrompt = `You are TripPlanner's Local Sightseeing & Activities Specialist Agent. 
Analyze the suggested places in ${destination} for a ${days}-day trip matching traveler interests: ${interests.join(', ')}.
Briefly explain if these matches fit traveler preferences, and highlight 2-3 key landmark recommendations in 2-3 sentences. Keep it short.`;
      const llmRes = await withRetry(() => llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(data)),
      ]));
      reasoning = llmRes.content.toString();
    } catch (err) {
      logger.error('Activity Agent reasoning analysis failed', err);
      reasoning = 'Local sight-seeing options align with generic adventure preferences.';
    }

    const finalResult = {
      ...data,
      reasoning,
      data_provenance: data?.source_status || 'google_places_live',
    };

    return JSON.stringify(finalResult);
  },
  {
    name: 'fetch_activities',
    description: 'Search for restaurants, attractions, local sightseeing locations, and food spots near a destination city matching interests.',
    schema: z.object({
      destination: z.string().describe('Destination city name'),
      interests: z.array(z.string()).describe('List of traveler interest categories'),
      days: z.number().describe('Duration of the trip in days'),
      travelers: z.number().optional().describe('Number of travelers'),
    }),
  }
);

