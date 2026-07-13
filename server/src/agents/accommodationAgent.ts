// Accommodation Agent — search hotels with 1-hour Redis cache.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import redis from '../config/redis';
import { searchHotels } from '../mcp-servers/bookingMCP';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant',
  temperature: 0.3,
});

export const accommodationTool = tool(
  async ({ destination, check_in, check_out, travelers, tier }) => {
    const cacheKey = `hotels:${destination}:${check_in}:${check_out}:${travelers}:${tier || 'default'}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug('Cache HIT — hotel options tool', { cacheKey });
        return cached;
      }
    } catch {
      logger.warn('Redis unavailable for hotel cache');
    }

    logger.debug('Cache MISS — hotel options tool fetching from MCP', { cacheKey });
    const data = await searchHotels(destination, check_in, check_out, travelers);

    // Standalone LLM Reasoning Phase
    let reasoning = '';
    try {
      const systemPrompt = `You are TripPlanner's Lodging & Accommodation Specialist Agent. 
Analyze the accommodation choices in ${destination} checking in on ${check_in} and out on ${check_out} for ${travelers} guests.
Briefly explain if the hotels are suitable, what amenities or lodging tiers are interesting, and safety/convenience ratings in 2-3 sentences. Keep it short.`;
      const llmRes = await withRetry(() => llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(data)),
      ]));
      reasoning = llmRes.content.toString();
    } catch (err) {
      logger.error('Accommodation Agent reasoning analysis failed', err);
      reasoning = 'Lodgings are chosen near primary destination routes.';
    }

    // Sort hotels by price to select the appropriate tier
    const hotelsList = [...(data.hotels || [])];
    const categories = {
      budget: [] as any[],
      mid_range: [] as any[],
      luxury: [] as any[],
    };

    if (hotelsList.length > 0) {
      // Sort ascending by price
      hotelsList.sort((a, b) => a.price_per_night_inr - b.price_per_night_inr);

      // Divide into three tiers as evenly as possible
      const totalCount = hotelsList.length;
      if (totalCount >= 3) {
        const size = Math.floor(totalCount / 3);
        categories.budget = hotelsList.slice(0, size);
        categories.mid_range = hotelsList.slice(size, 2 * size);
        categories.luxury = hotelsList.slice(2 * size);
      } else if (totalCount === 2) {
        categories.budget = [hotelsList[0]];
        categories.mid_range = [hotelsList[0]];
        categories.luxury = [hotelsList[1]];
      } else {
        categories.budget = [hotelsList[0]];
        categories.mid_range = [hotelsList[0]];
        categories.luxury = [hotelsList[0]];
      }

      // Limit each category to a maximum of 3 recommended hotels
      categories.budget = categories.budget.slice(0, 3);
      categories.mid_range = categories.mid_range.slice(0, 3);
      categories.luxury = categories.luxury.slice(0, 3);
    }

    // Pre-select hotel based on the requested tier. Default to mid-range.
    let selectedCategory: 'budget' | 'mid_range' | 'luxury' = 'mid_range';
    if (tier === 'budget' || tier === 'luxury') {
      selectedCategory = tier;
    }

    // Fallback if the selected category is empty, find the first non-empty category
    if (categories[selectedCategory].length === 0) {
      if (categories.mid_range.length > 0) selectedCategory = 'mid_range';
      else if (categories.budget.length > 0) selectedCategory = 'budget';
      else if (categories.luxury.length > 0) selectedCategory = 'luxury';
    }

    const selectedHotel = categories[selectedCategory][0] || null;

    if (selectedHotel) {
      // Re-order data.hotels so selectedHotel is at index 0 for the budgetAgent
      const originalIdx = data.hotels.findIndex((h: any) => h.name === selectedHotel.name);
      if (originalIdx > -1) {
        const [removed] = data.hotels.splice(originalIdx, 1);
        data.hotels.unshift(removed);
      }

      data.recommended = selectedHotel.name;
      data.price_per_night = selectedHotel.price_per_night_inr;
    }

    const finalResult = {
      ...data,
      categories,
      selected_category: selectedCategory,
      selected_hotel: selectedHotel,
      reasoning,
    };

    const finalResultString = JSON.stringify(finalResult);
    try {
      await redis.setex(cacheKey, 365, finalResultString);
    } catch {
      logger.warn('Could not write hotels to cache');
    }

    return finalResultString;
  },
  {
    name: 'fetch_accommodation',
    description: 'Search for recommended hotels in a destination city/area for specific dates and guest count.',
    schema: z.object({
      destination: z.string().describe('Destination city/area name'),
      check_in: z.string().describe('Check-in travel date (YYYY-MM-DD)'),
      check_out: z.string().describe('Check-out travel date (YYYY-MM-DD)'),
      travelers: z.number().describe('Number of guests/travelers'),
      tier: z.enum(['luxury', 'mid-range', 'budget']).optional().describe('Hotel budget tier. Choose budget if user requested cheaper hotels or budget accommodation.')
    }),
  }
);
