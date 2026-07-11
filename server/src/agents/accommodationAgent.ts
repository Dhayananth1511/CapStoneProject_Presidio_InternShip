// Accommodation Agent — search hotels with 1-hour Redis cache.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import redis from '../config/redis';
import { searchHotels } from '../mcp-servers/bookingMCP';
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
      const systemPrompt = `You are VoyageFlow's Lodging & Accommodation Specialist Agent. 
Analyze the accommodation choices in ${destination} checking in on ${check_in} and out on ${check_out} for ${travelers} guests.
Briefly explain if the hotels are suitable, what amenities or lodging tiers are interesting, and safety/convenience ratings in 2-3 sentences. Keep it short.`;
      const llmRes = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(data)),
      ]);
      reasoning = llmRes.content.toString();
    } catch (err) {
      logger.error('Accommodation Agent reasoning analysis failed', err);
      reasoning = 'Lodgings are chosen near primary destination routes.';
    }

    // Sort hotels by price to select the appropriate tier
    const hotelsList = [...(data.hotels || [])];
    if (hotelsList.length > 0) {
      // Sort ascending by price
      hotelsList.sort((a, b) => a.price_per_night_inr - b.price_per_night_inr);
      
      let selectedHotel = hotelsList[Math.floor(hotelsList.length / 2)]; // default to mid-range
      if (tier === 'budget') {
        selectedHotel = hotelsList[0]; // cheapest
      } else if (tier === 'luxury') {
        selectedHotel = hotelsList[hotelsList.length - 1]; // most expensive
      } else if (tier === 'mid-range') {
        selectedHotel = hotelsList[Math.floor(hotelsList.length / 2)];
      } else {
        // Default to first hotel returned originally by searchHotels
        const defaultRec = data.hotels.find((h: any) => h.name === data.recommended);
        if (defaultRec) selectedHotel = defaultRec;
      }

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
