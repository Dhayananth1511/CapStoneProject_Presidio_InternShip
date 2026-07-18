import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { searchHotels } from '../mcp-servers/bookingMCP';
import { getHotelsNearby } from '../mcp-servers/mapsMCP';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';
import { createChatModel } from '../utils/llm';
import { getAccommodationFallbackPrompt, getAccommodationReasoningPrompt } from '../prompts';
import { calculateNights } from '../utils/dateHelpers';

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
  const nights = calculateNights(check_in, check_out);

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
        source_type: 'llm_recommendation' as const,
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
    if (!data.hotels) {
      data.hotels = [];
    }

    const nights = calculateNights(check_in, check_out);

    // Also fetch Geoapify hotels and merge them in (deduped by name)
    let geoapifyHotels: any[] = [];
    try {
      geoapifyHotels = await getHotelsNearby(destination, nights);
      logger.info(`[accommodationAgent] Geoapify returned ${geoapifyHotels.length} hotels for ${destination}`);
    } catch (geoErr: any) {
      logger.warn(`[accommodationAgent] Geoapify hotel lookup failed: ${geoErr.message}`);
    }

    // Always fetch LLM recommendations to mix them together
    let llmHotels: any[] = [];
    try {
      llmHotels = await generateAccommodationFallback(destination, check_in, check_out, travelers, max_price_per_night);
      logger.info(`[accommodationAgent] LLM recommendations generated ${llmHotels.length} hotels for ${destination}`);
    } catch (llmErr: any) {
      logger.warn(`[accommodationAgent] LLM hotel recommendations generation failed: ${llmErr.message}`);
    }

    // Tag all hotels with their proper source_type
    const taggedHotelbeds = (data.hotels || []).map((h: any) => ({
      ...h,
      source_type: h.source_type || 'hotelbeds_api',
    }));

    const taggedGeoapify = geoapifyHotels.map((h: any) => ({
      ...h,
      source_type: h.source_type || 'geoapify_places',
    }));

    const taggedLlm = llmHotels.map((h: any) => ({
      ...h,
      source_type: h.source_type || 'llm_recommendation',
      is_llm_recommended: true, 
    }));

    // Merge and deduplicate by name (case-insensitive)
    const existingNames = new Set<string>();
    const mergedHotels: any[] = [];

    [...taggedHotelbeds, ...taggedGeoapify, ...taggedLlm].forEach((hotel: any) => {
      const nameKey = (hotel.name || '').toLowerCase().trim();
      if (nameKey && !existingNames.has(nameKey)) {
        existingNames.add(nameKey);
        mergedHotels.push(hotel);
      }
    });

    data.hotels = mergedHotels;

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

    // ── Price categorization ──────────────────────────────
    let BUDGET_MAX = 4999;
    let MID_MIN = 5000;
    let MID_MAX = 15000;
    let LUXURY_MIN = 15001;

    if (max_price_per_night && max_price_per_night > 0) {
      BUDGET_MAX = Math.round(max_price_per_night * 0.4);
      MID_MIN = BUDGET_MAX + 1;
      MID_MAX = Math.round(max_price_per_night * 0.85);
      LUXURY_MIN = MID_MAX + 1;
    }

    const categories: { budget: any[]; mid_range: any[]; luxury: any[] } = {
      budget: [],
      mid_range: [],
      luxury: [],
    };

    // Sort all matched hotels by price (ascending)
    const hotelsList = [...(data.hotels || [])].sort((a, b) => a.price_per_night_inr - b.price_per_night_inr);

    // Classify real hotels by exact price thresholds first
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

    // Check if any category is empty. If so, redistribute using tertiles to ensure "all time 3 category" are populated
    const hasEmptyCategory = categories.budget.length === 0 || categories.mid_range.length === 0 || categories.luxury.length === 0;
    if (hasEmptyCategory && hotelsList.length >= 3) {
      logger.info('Some category was empty under strict thresholds; falling back to tertile partitioning');
      const third = Math.floor(hotelsList.length / 3);
      categories.budget = hotelsList.slice(0, third);
      categories.mid_range = hotelsList.slice(third, 2 * third);
      categories.luxury = hotelsList.slice(2 * third);
    } else if (hasEmptyCategory && hotelsList.length === 2) {
      categories.budget = [hotelsList[0]];
      categories.mid_range = [hotelsList[1]];
      categories.luxury = [hotelsList[1]];
    } else if (hasEmptyCategory && hotelsList.length === 1) {
      categories.budget = [hotelsList[0]];
      categories.mid_range = [hotelsList[0]];
      categories.luxury = [hotelsList[0]];
    }

    // Within each price category, sort the list by rating (descending) so the highest-rated stay is recommended first.
    categories.budget.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
    categories.mid_range.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
    categories.luxury.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));

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

    // If a max_price_per_night constraint is set, overall pre-select the category with the absolute highest-rated hotel.
    if (max_price_per_night && max_price_per_night > 0) {
      let bestRating = -1;
      let targetCat: 'budget' | 'mid_range' | 'luxury' = 'budget';
      const catKeys: Array<'budget' | 'mid_range' | 'luxury'> = ['budget', 'mid_range', 'luxury'];
      catKeys.forEach(cat => {
        const topHotel = categories[cat][0];
        if (topHotel && (topHotel.rating || 0) > bestRating) {
          bestRating = topHotel.rating || 0;
          targetCat = cat;
        }
      });
      selectedCategory = targetCat;
    }

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

    // Compute thresholds dynamically based on Distributed Categorization to show on frontend
    const formatPrice = (p: number) => {
      if (p >= 1000) return `₹${Math.round(p/1000)}k`;
      return `₹${p}`;
    };

    const maxBudget = categories.budget.length > 0 ? Math.max(...categories.budget.map(h => h.price_per_night_inr)) : BUDGET_MAX;
    const minMid = categories.mid_range.length > 0 ? Math.min(...categories.mid_range.map(h => h.price_per_night_inr)) : MID_MIN;
    const maxMid = categories.mid_range.length > 0 ? Math.max(...categories.mid_range.map(h => h.price_per_night_inr)) : MID_MAX;
    const minLux = categories.luxury.length > 0 ? Math.min(...categories.luxury.map(h => h.price_per_night_inr)) : LUXURY_MIN;

    const finalResult = {
      ...data,
      categories,
      selected_category: selectedCategory,
      selected_hotel: selectedHotel,
      category_thresholds: {
        budget: `<${formatPrice(maxBudget + 1)}/night`,
        mid_range: `${formatPrice(minMid)} – ${formatPrice(maxMid)}/night`,
        luxury: `>${formatPrice(minLux - 1)}/night`,
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
      tier: z.enum(['luxury', 'mid_range', 'budget']).optional().describe('Hotel budget tier preference. Use budget for <₹5000/night, mid_range for ₹5000-₹15000/night, luxury for >₹15000/night.'),
      max_price_per_night: z.number().optional().describe('Optional strict price ceiling in INR per night. When provided, only hotels at or below this price will be returned.')
    }),
  }
);
