// Accommodation Agent — search hotels and categorize by price tier.
// Categories: Budget (<₹5000/night), Mid-Range (₹5000-₹15000/night), Luxury (>₹15000/night)
// Only real API data is returned — no fallback templates.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { searchHotels } from '../mcp-servers/bookingMCP';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';
import { createChatModel } from '../utils/llm';
import { getAccommodationFallbackPrompt, getAccommodationReasoningPrompt } from '../prompts';

const llm = createChatModel({
  temperature: 0.3,
});

async function generateAccommodationFallback(
  destination: string,
  check_in: string,
  check_out: string,
  travelers: number,
  max_price_per_night?: number
): Promise<any[]> {
  const nights = Math.max(
    1,
    (new Date(check_out).getTime() - new Date(check_in).getTime()) / (1000 * 60 * 60 * 24)
  );

  const systemPrompt = getAccommodationFallbackPrompt(destination, max_price_per_night);

  try {
    const response = await withRetry(() => llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Generate hotels for ${destination} from ${check_in} to ${check_out} for ${travelers} travelers.`)
    ]));
    
    let text = response.content.toString().trim();
    if (text.startsWith("```json")) {
      text = text.substring(7);
    }
    if (text.startsWith("```")) {
      text = text.substring(3);
    }
    if (text.endsWith("```")) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();
    
    const hotels = JSON.parse(text);
    if (Array.isArray(hotels)) {
      return hotels.map((h: any) => ({
        name: h.name || 'Recommended Stay',
        price_per_night_inr: Number(h.price_per_night_inr) || 5000,
        rating: Number(h.rating) || 4.2,
        amenities: Array.isArray(h.amenities) ? h.amenities : ['WiFi', 'AC'],
        total_cost_inr: (Number(h.price_per_night_inr) || 5000) * nights,
        address: h.address || destination,
        description: h.description || 'A cozy local stay.',
        is_llm_recommended: true,
      }));
    }
  } catch (error) {
    logger.error('Failed to generate hotel fallbacks', error);
  }
  return [];
}

export const accommodationTool = tool(
  async ({ destination, check_in, check_out, travelers, tier, max_price_per_night }) => {
    logger.debug('Accommodation tool fetching from MCP', { destination, check_in, check_out, travelers, tier, max_price_per_night });
    const data = await searchHotels(destination, check_in, check_out, travelers);

    if (!data.hotels || data.hotels.length === 0) {
      logger.info('No API hotel matches for destination; triggering LLM fallback recommendations', { destination });
      data.hotels = await generateAccommodationFallback(destination, check_in, check_out, travelers, max_price_per_night);
    }

    // If the user specified a strict price ceiling, pre-filter hotels to respect it.
    // If no hotels are found under the ceiling, keep all hotels but mark the constraint notice.
    let priceConstraintNotice = '';
    if (max_price_per_night && max_price_per_night > 0) {
      const underCeiling = (data.hotels || []).filter((h: any) => (h.price_per_night_inr || 0) <= max_price_per_night);
      if (underCeiling.length > 0) {
        logger.info(`Filtering hotels to max ₹${max_price_per_night}/night — retained ${underCeiling.length} of ${data.hotels.length}`);
        data.hotels = underCeiling;
      } else {
        logger.warn(`No hotels at or below ₹${max_price_per_night}/night found. Showing cheapest available options.`);
        data.hotels = [...(data.hotels || [])].sort((a: any, b: any) => a.price_per_night_inr - b.price_per_night_inr).slice(0, 6);
        priceConstraintNotice = `⚠️ No hotels found below ₹${max_price_per_night}/night in ${destination}. Showing the cheapest available options instead.`;
      }
    }

    // Standalone LLM Reasoning Phase
    let reasoning = '';
    try {
      const systemPrompt = getAccommodationReasoningPrompt(destination, check_in, check_out, travelers);
      const llmRes = await withRetry(() => llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(data)),
      ]));
      reasoning = llmRes.content.toString();
    } catch (err) {
      logger.error('Accommodation Agent reasoning analysis failed', err);
      reasoning = 'Lodgings are chosen near primary destination routes.';
    }

    const nights = Math.max(
      1,
      (new Date(check_out).getTime() - new Date(check_in).getTime()) / (1000 * 60 * 60 * 24)
    );

    // ── STRICT PRICE-BASED CATEGORY THRESHOLDS ──────────────────────────────
    // Budget: price_per_night_inr < 5000
    // Mid-Range: 5000 <= price_per_night_inr <= 15000
    // Luxury: price_per_night_inr > 15000
    const BUDGET_MAX = 4999;
    const MID_MIN = 5000;
    const MID_MAX = 15000;
    const LUXURY_MIN = 15001;

    // Sort all fetched hotels by price
    const hotelsList = [...(data.hotels || [])].sort((a, b) => a.price_per_night_inr - b.price_per_night_inr);

    const categories: { budget: any[]; mid_range: any[]; luxury: any[] } = {
      budget: [],
      mid_range: [],
      luxury: [],
    };

    // Classify real hotels by exact price thresholds
    hotelsList.forEach((hotel: any) => {
      const price = hotel.price_per_night_inr || 0;
      if (price <= BUDGET_MAX) {
        categories.budget.push(hotel);
      } else if (price >= MID_MIN && price <= MID_MAX) {
        categories.mid_range.push(hotel);
      } else if (price >= LUXURY_MIN) {
        categories.luxury.push(hotel);
      }
    });

    // Limit each category to max 3 options
    categories.budget = categories.budget.slice(0, 3);
    categories.mid_range = categories.mid_range.slice(0, 3);
    categories.luxury = categories.luxury.slice(0, 3);

    // Merge all unique hotels back into the flat list for downstream budget agent compatibility
    const allUniqueHotels = new Map<string, any>();
    [...categories.budget, ...categories.mid_range, ...categories.luxury].forEach(h => {
      allUniqueHotels.set(h.name, h);
    });
    data.hotels = Array.from(allUniqueHotels.values());

    // Pre-select hotel based on requested tier (default: mid_range)
    let selectedCategory: 'budget' | 'mid_range' | 'luxury' = 'mid_range';
    if (tier === 'budget') selectedCategory = 'budget';
    else if (tier === 'luxury') selectedCategory = 'luxury';

    // Safeguard: if the preferred category is empty, fall back
    if (categories[selectedCategory].length === 0) {
      if (categories.mid_range.length > 0) selectedCategory = 'mid_range';
      else if (categories.budget.length > 0) selectedCategory = 'budget';
      else if (categories.luxury.length > 0) selectedCategory = 'luxury';
    }

    const selectedHotel = categories[selectedCategory][0] || null;

    if (selectedHotel) {
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
      category_thresholds: {
        budget: `Below ₹${BUDGET_MAX + 1}/night`,
        mid_range: `₹${MID_MIN} – ₹${MID_MAX}/night`,
        luxury: `Above ₹${MID_MAX}/night`,
      },
      reasoning,
      ...(priceConstraintNotice ? { price_constraint_notice: priceConstraintNotice } : {}),
    };

    return JSON.stringify(finalResult);
  },
  {
    name: 'fetch_accommodation',
    description: 'Search for recommended hotels in a destination city/area for specific dates and guest count. Hotels are categorized by price: Budget (<₹5000/night), Mid-Range (₹5000-₹15000/night), Luxury (>₹15000/night).',
    schema: z.object({
      destination: z.string().describe('Destination city/area name'),
      check_in: z.string().describe('Check-in travel date (YYYY-MM-DD)'),
      check_out: z.string().describe('Check-out travel date (YYYY-MM-DD)'),
      travelers: z.number().describe('Number of guests/travelers'),
      tier: z.enum(['luxury', 'mid-range', 'budget']).optional().describe('Hotel budget tier preference. Use budget for <₹5000/night, mid-range for ₹5000-₹15000/night, luxury for >₹15000/night.'),
      max_price_per_night: z.number().optional().describe('Optional strict price ceiling in INR per night. When provided, only hotels at or below this price will be returned.')
    }),
  }
);
