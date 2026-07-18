import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { searchHotelbedsActivities } from '../mcp-servers/hotelbedsActivitiesMCP';
import { getPlacesNearby } from '../mcp-servers/mapsMCP';
import { isHotelbedsConfigured } from '../mcp-servers/hotelbedsClient';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';
import { createChatModel } from '../utils/llm';
import { getActivityFallbackPrompt, getActivityReasoningPrompt, getActivityFilteringPrompt } from '../prompts';

const llm = createChatModel({
  temperature: 0.3,
});

import { extractJsonObject } from '../utils/jsonHelpers';


async function generateRecommendationFallback(destination: string, interests: string[], days: number) {
  const attractionCount = Math.max(8, Math.min(80, days * 4));
  const restaurantCount = Math.max(6, Math.min(40, days * 3));
  const fallbackPrompt = getActivityFallbackPrompt(destination, attractionCount, restaurantCount, interests);

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
          source_type: 'hotelbeds_api' as const,
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

    data = data || {};
    data.attraction_options = Array.isArray(data.attraction_options) ? data.attraction_options : [];
    data.restaurant_options = Array.isArray(data.restaurant_options) ? data.restaurant_options : [];

    // Fall back to LLM recommendations if the live search returns no tourist attractions or no restaurants
    if (data.attraction_options.length === 0 || data.restaurant_options.length === 0) {
      logger.info('Live provider returned empty results. Generating high-quality LLM recommendation fallbacks.');
      const fallbackData = await generateRecommendationFallback(destination, interests, days);
      data.attraction_options = [...data.attraction_options, ...fallbackData.attraction_options];
      data.restaurant_options = [...data.restaurant_options, ...fallbackData.restaurant_options];
      data.restaurants = [...(data.restaurants || []), ...fallbackData.restaurants];
      data.attractions = [...(data.attractions || []), ...fallbackData.attractions];
    }

    // Track original API names before LLM filtering (to reliably tag source_type)
    const originalApiNames = new Set<string>(
      data.attraction_options
        .filter((a: any) => a.source_type === 'geoapify_places' || a.source_type === 'hotelbeds_api')
        .map((a: any) => (a.name || '').toLowerCase().trim())
    );

    // Filter, Supplement, Rate & Sort Attractions with LLM
    try {
      const attractionCount = Math.max(8, Math.min(80, days * 4));
      const filteringPrompt = getActivityFilteringPrompt(destination, attractionCount, interests);
      // Cap the raw payload sent to the filter LLM — large lists on long trips (>15 days)
      // can exceed token limits and cause rate-limit errors or truncated responses.
      const rawPayloadCap = Math.min(40, attractionCount);
      const cappedAttractions = data.attraction_options.slice(0, rawPayloadCap);
      const filterRes = await withRetry(() => llm.invoke([
        new SystemMessage(filteringPrompt),
        new HumanMessage(`Raw list of attractions to filter and supplement: ${JSON.stringify(cappedAttractions)}`)
      ]));

      const parsed = extractJsonObject(filterRes.content.toString());
      if (parsed && Array.isArray(parsed.attractions)) {
        // Cross-validate source_type: if the name was in the original API list → geoapify_places
        // If it wasn't → it was supplemented by the LLM → llm_recommendation
        data.attraction_options = parsed.attractions.map((a: any) => {
          const nameKey = (a.name || '').toLowerCase().trim();
          const wasFromApi = originalApiNames.has(nameKey);
          return {
            ...a,
            source_type: wasFromApi ? 'geoapify_places' : 'llm_recommendation',
            is_llm_recommended: !wasFromApi,
          };
        });
        data.attractions = data.attraction_options.map((a: any) => a.name);
      }
    } catch (err) {
      logger.error('Activity Agent failed to filter / supplement raw attractions', err);
      // Fallback: keep attractions with correct source tags
      data.attraction_options = data.attraction_options.map((item: any) => ({
        ...item,
        description: item.description || `A popular local attraction in ${destination}.`
      }));
    }

    // Standalone LLM Reasoning Phase
    let reasoning = '';
    try {
      const systemPrompt = getActivityReasoningPrompt(destination, interests, days);
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

