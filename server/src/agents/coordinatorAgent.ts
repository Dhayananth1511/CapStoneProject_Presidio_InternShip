// Coordinator Agent — the orchestrator and final synthesizer.
// Coordinates dynamic tool execution using LangChain Tool-Calling and compiles the Markdown plan.

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';
import { weatherTool } from './weatherAgent';
import { transportTool } from './transportAgent';
import { accommodationTool } from './accommodationAgent';
import { activityTool } from './activityAgent';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';
import { createChatModel } from '../utils/llm';

const llm = createChatModel({
  temperature: 0.5,
});

const routerLlm = createChatModel({
  temperature: 0.1,
  tools: [
    weatherTool,
    transportTool,
    accommodationTool,
    activityTool,
  ],
});

function isBudgetOnlyAdjustment(userMessage: string): boolean {
  const message = userMessage.toLowerCase();
  const mentionsBudget = /(budget|increase limit|increase budget|raise budget|more money|adjust budget|budget ceiling|limit to|my budget is)/.test(message);
  const mentionsOtherReplanTargets = /(change hotel|different hotel|cheaper hotel|find hotel|find cheaper|change accommodation|different accommodation|change lodging|change stay|transport|flight|train|bus|date|day|duration|shorten|extend|activity|activities|restaurant|destination|go to|change to)/.test(message);
  return mentionsBudget && !mentionsOtherReplanTargets;
}

function isAccommodationChangeRequest(userMessage: string): boolean {
  const message = userMessage.toLowerCase();
  // Detect any message that asks for a hotel change, different tier, or a specific price constraint.
  // Note: /x flag not supported in JS — use new RegExp() instead.
  const pattern = new RegExp(
    'change hotel|different hotel|cheaper hotel|find hotel|find cheaper|' +
    'change accommodation|different accommodation|change lodging|change stay|' +
    'budget hotel|luxury hotel|mid-range hotel|' +
    'hotel price|hotel under|hotel below|hotel less than|hotel within|' +
    'hotel.{0,20}per night|per night.{0,20}hotel|price.{0,10}night|night.{0,10}price|' +
    'stay under|stay below|accommodation under|lodging under|' +
    'cheap hotel|cheap stay|cheap room|cheap lodging|' +
    'hotel.{0,10}\\d{3,}|\\d{3,}.{0,10}hotel|\\d{3,}.{0,10}night'
  );
  return pattern.test(message);
}

function preserveSelectedHotel(existingAccommodation: any, fetchedAccommodation: any, userMessage: string): any {
  if (!existingAccommodation?.selected_hotel || isAccommodationChangeRequest(userMessage)) {
    return fetchedAccommodation;
  }

  const selectedHotelName = existingAccommodation.selected_hotel?.name;
  if (!selectedHotelName) {
    return fetchedAccommodation;
  }

  const hotels = Array.isArray(fetchedAccommodation?.hotels) ? [...fetchedAccommodation.hotels] : [];
  const matchedHotel = hotels.find((hotel) => hotel?.name === selectedHotelName);

  if (!matchedHotel) {
    return {
      ...fetchedAccommodation,
      selected_hotel: existingAccommodation.selected_hotel,
      recommended: existingAccommodation.selected_hotel?.name || fetchedAccommodation?.recommended,
      selected_category: existingAccommodation.selected_category || fetchedAccommodation?.selected_category,
      price_per_night: existingAccommodation.selected_hotel?.price_per_night_inr || existingAccommodation.price_per_night || fetchedAccommodation?.price_per_night,
    };
  }

  const matchedCategory = ['budget', 'mid_range', 'luxury'].find((category) =>
    Array.isArray(fetchedAccommodation?.categories?.[category]) &&
    fetchedAccommodation.categories[category].some((hotel: any) => hotel?.name === selectedHotelName)
  );

  const reorderedHotels = [matchedHotel, ...hotels.filter((hotel) => hotel?.name !== selectedHotelName)];

  return {
    ...fetchedAccommodation,
    hotels: reorderedHotels,
    selected_hotel: matchedHotel,
    recommended: matchedHotel.name,
    selected_category: existingAccommodation.selected_category || matchedCategory || fetchedAccommodation?.selected_category,
    price_per_night: matchedHotel.price_per_night_inr || fetchedAccommodation?.price_per_night,
  };
}

export async function runParallelAgents(context: TripContext, userMessage: string): Promise<TripContext> {
  const { input } = context;
  const days = input.start_date && input.end_date
    ? (new Date(input.end_date).getTime() - new Date(input.start_date).getTime()) / (1000 * 60 * 60 * 24)
    : 5;

  const hasExistingPlanData = !!(
    context.weather?.forecast?.length ||
    context.transport?.options?.length ||
    context.accommodation?.hotels?.length ||
    context.activities?.attractions?.length
  );

  if (hasExistingPlanData && isBudgetOnlyAdjustment(userMessage)) {
    logger.info('Budget-only adjustment detected. Reusing existing fetched data without rerunning supplier tools.', {
      userMessage,
      sessionId: context.sessionId,
    });
    return { ...context };
  }

  logger.info('Starting Dynamic LLM Tool router analysis', { userMessage });

  // Extract explicit price ceiling from user message if present (e.g. "below 1000/night", "under ₹2000")
  const priceCeilingMatch = userMessage.match(/(?:below|under|less than|within|max|maximum|upto|up to)\s*[₹]?\s*(\d+)/i);
  const userPriceCeiling = priceCeilingMatch ? parseInt(priceCeilingMatch[1], 10) : null;

  const systemPrompt = `You are an intelligent travel supervisor. Based on the user query and current state, call the appropriate tools.
Rules:
1. If this is the initial planning session (i.e. context contains mostly empty fields or no weather/hotel/transit data is fetched), call ALL four tools:
   - fetch_weather (requires destination, start_date, end_date)
   - fetch_transport (requires origin, destination, travel_date, travelers)
   - fetch_accommodation (requires destination, check_in, check_out, travelers)
   - fetch_activities (requires destination, interests, days)
2. If this is a modification (re-planning) request, call ONLY the tool(s) specific to the user's requirements:
   - "change hotel" or "find different lodging" or choosing a cheaper hotel tier or requesting a specific hotel price/budget → call fetch_accommodation.
   - "add food spots" or "new interests" → call ONLY fetch_activities.
   - "change dates" → dates impact transit, accommodation, and weather, so call fetch_weather, fetch_transport, and fetch_accommodation.
3. For fetch_accommodation, you must pass the optional "tier" parameter based on the user's details:
   - If user asks to choose a cheaper hotel tier, save money on lodging, or requests budget/cheap options or a specific low price ceiling (e.g. "below ₹1000", "under ₹2000 per night"), pass tier="budget".
   - If user requests luxury, high-end, premium, or expensive options, pass tier="luxury".
   - If user requests normal, mid-range, average, or moderate options, pass tier="mid-range".
Ensure you populate tool arguments using the current context: destination="${input.destination || ''}", origin="${input.origin || ''}", start_date="${input.start_date || ''}", end_date="${input.end_date || ''}", travelers=${input.travelers || 0}, days=${days}, interests=${JSON.stringify(input.interests || [])}.${userPriceCeiling ? `
Note: The user has explicitly requested a maximum hotel price of ₹${userPriceCeiling}/night. When calling fetch_accommodation, you must pass tier="budget" and max_price_per_night=${userPriceCeiling} to restrict results.` : ''}`;

  const response = await withRetry(() => routerLlm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`User query: "${userMessage}"\n\nCurrent context state: ${JSON.stringify({
      hasWeather: !!context.weather?.forecast?.length,
      hasTransport: !!context.transport?.options?.length,
      hasAccommodation: !!context.accommodation?.hotels?.length,
      hasActivities: !!context.activities?.attractions?.length,
    })}`)
  ]));

  const toolCalls = response.tool_calls || [];
  logger.info('LLM Router tool selection result', { toolCallsCount: toolCalls.length, toolCalls: toolCalls.map((t: any) => t.name) });

  // If the LLM did not choose any tools despite missing data, fall back to executing all tools
  if (toolCalls.length === 0 && (!context.weather?.forecast?.length || !context.accommodation?.hotels?.length)) {
    logger.warn('LLM chose no tools on empty context. Falling back to executing all tools.');
    toolCalls.push(
      { name: 'fetch_weather', args: { destination: input.destination!, start_date: input.start_date!, end_date: input.end_date! } },
      { name: 'fetch_transport', args: { origin: input.origin!, destination: input.destination!, travel_date: input.start_date!, travelers: input.travelers } },
      { name: 'fetch_accommodation', args: { destination: input.destination!, check_in: input.start_date!, check_out: input.end_date!, travelers: input.travelers } },
      { name: 'fetch_activities', args: { destination: input.destination!, interests: input.interests || [], days } }
    );
  }

  const newContext = { ...context };

  const promises = toolCalls.map(async (toolCall: any) => {
    const toolName = toolCall.name;
    const args = { ...toolCall.args } as any;

    // Apply strict programmatic overrides to prevent LLM argument/naming confusion (origin/destination swaps)
    if (input.destination) {
      if (args.destination && args.destination !== input.destination) {
        logger.warn(`Orchestrator: Correcting LLM argument 'destination' from "${args.destination}" to context destination "${input.destination}" for tool "${toolName}"`);
      }
      args.destination = input.destination;
    }
    
    if (toolName === 'fetch_transport' && input.origin) {
      if (args.origin && args.origin !== input.origin) {
        logger.warn(`Orchestrator: Correcting LLM argument 'origin' from "${args.origin}" to context origin "${input.origin}" for tool "${toolName}"`);
      }
      args.origin = input.origin;
    }

    // Force dates and days to strictly align with planned context numbers
    if (toolName === 'fetch_weather') {
      if (input.start_date) args.start_date = input.start_date;
      if (input.end_date) args.end_date = input.end_date;
    } else if (toolName === 'fetch_transport') {
      if (input.start_date) args.travel_date = input.start_date;
    } else if (toolName === 'fetch_accommodation') {
      if (input.start_date) args.check_in = input.start_date;
      if (input.end_date) args.check_out = input.end_date;
    } else if (toolName === 'fetch_activities') {
      args.days = days;
    }

    let rawResult: any;
    if (toolName === 'fetch_weather') {
      rawResult = await weatherTool.invoke(args as any);
    } else if (toolName === 'fetch_transport') {
      rawResult = await transportTool.invoke(args as any);
    } else if (toolName === 'fetch_accommodation') {
      rawResult = await accommodationTool.invoke(args as any);
    } else if (toolName === 'fetch_activities') {
      rawResult = await activityTool.invoke(args as any);
    } else {
      throw new Error(`Unknown tool chosen by LLM: ${toolName}`);
    }

    const resultString = typeof rawResult === 'string'
      ? rawResult
      : (rawResult && 'content' in rawResult ? String(rawResult.content) : JSON.stringify(rawResult));

    return { name: toolName, value: JSON.parse(resultString) };
  });

  const results = await Promise.allSettled(promises);

  results.forEach((res) => {
    if (res.status === 'fulfilled') {
      const { name, value } = res.value;
      if (name === 'fetch_weather') newContext.weather = value;
      else if (name === 'fetch_transport') newContext.transport = value;
      else if (name === 'fetch_accommodation') newContext.accommodation = preserveSelectedHotel(context.accommodation, value, userMessage);
      else if (name === 'fetch_activities') newContext.activities = value;
    } else {
      const err = res.reason;
      logger.error('Dynamic tool call failed during concurrent execution', {
        errorMessage: err?.message || String(err),
        errorStack: err?.stack,
      });
    }
  });

  return newContext;
}

export async function synthesizeTripPlan(context: TripContext): Promise<string> {
  const systemPrompt = `You are a travel content writer. Create a beautiful, structured markdown travel plan.
Include: trip overview, weather summary, transport details, hotel description, day-by-day schedule overview, 
budget breakdown table, and packing tips. Use emojis and professional formatting.
IMPORTANT: Always structure your output with Day 1, Day 2, etc. sections.
IMPORTANT: In the cost breakdown table, you MUST explicitly include a row for each item in the budget: Transit/Transport, Lodging/Accommodation, Food, Activities, Local Transport (or Commutes), Emergency Fund, Total Cost, and Remaining Budget.
Note: If the compactContext contains an "accommodation_notice", you MUST output it clearly at the very top of your document (e.g. using a warning or info emoji) to inform the user about the hotel price/constraint situation.`;

  // Create a highly compact, token-efficient summary of the context.
  // Dumping the raw context string causes prompt token bloat, triggering 429 Rate Limits and LLM response truncation.
  const compactSummary = {
    destination: context.input.destination,
    dates: `${context.input.start_date} to ${context.input.end_date}`,
    travelers: context.input.travelers,
    budget_limit: context.input.budget_inr,
    budget_breakdown: context.budget,
    weather_info: context.weather?.reasoning || 'Check local weather conditions on arrival.',
    accommodation: context.accommodation?.recommended || 'Comfortable local accommodation',
    accommodation_notice: context.accommodation?.price_constraint_notice || '',
    transport: context.transport?.options?.[0]
      ? {
          provider: context.transport.options[0].provider,
          type: context.transport.options[0].type,
          price_inr: context.transport.options[0].price_inr,
          duration: context.transport.options[0].duration,
        }
      : 'Arranging own transport.',
    activities_interests: {
      attractions: (context.activities?.attractions || []).slice(0, 10),
      restaurants: (context.activities?.restaurants || []).slice(0, 6),
    },
    itinerary_days: (context.itinerary?.days || []).map((d: any) => ({
      day: d.day,
      date: d.date,
      title: d.title,
      daily_total_inr: d.daily_total_inr,
      weather_note: d.weather_note,
      highlights: (d.schedule || []).map((item: any) => `${item.time} - ${item.activity} (${item.location})`),
    })),
    notes: context.itinerary?.notes || '',
  };

  // Retry up to 2 times if the LLM output is insufficient
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await withRetry(
        () => llm.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(JSON.stringify(compactSummary, null, 2)),
        ]),
        { maxRetries: 4, timeout: 30000 } // Generous timeout for synthesis
      );

      const output = response.content.toString();

      // Content validation: must be substantial and contain structured itinerary markers
      const isSubstantial = output.length >= 200;
      const hasDateStructure = /day\s*\d+/i.test(output) || /\*\*day/i.test(output);

      if (isSubstantial && hasDateStructure) {
        return output;
      }

      logger.warn(`synthesizeTripPlan output failed content validation (attempt ${attempt}/2)`, {
        length: output.length,
        hasDateStructure,
        preview: output.slice(0, 100),
      });
    } catch (err: any) {
      logger.error(`synthesizeTripPlan error (attempt ${attempt}/2): ${err.message}`);
    }
  }

  // Safe fallback: return a minimal but correct plan structure
  const { destination, start_date, end_date, travelers } = context.input;
  return `## ✈️ Trip to ${destination}

**Dates:** ${start_date} → ${end_date}  
**Travelers:** ${travelers}  

> ⚠️ The AI was unable to generate a detailed plan for this trip. Your trip parameters have been saved. Please click **Reject & Replan** to try again, or adjust your travel inputs.

### Summary
Your trip data has been collected and validated. Use the Interactive Timeline tab on the left to view the day-by-day schedule that was generated.`;
}
