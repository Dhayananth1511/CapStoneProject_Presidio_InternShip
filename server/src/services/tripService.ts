import Trip from '../models/Trip';
import User from '../models/User';
import logger from '../utils/logger';
import { planTrip } from './plannerService';
import { runBookingAgent } from '../agents/bookingAgent';
import { runReplanningAgent } from '../agents/replanningAgent';
import { runBudgetAgent } from '../agents/budgetAgent';
import { runLocalTransitAgent } from '../agents/localTransitAgent';
import { runItineraryAgent } from '../agents/itineraryAgent';
import { synthesizeTripPlan } from '../agents/coordinatorAgent';
import { isMessageSafe } from '../utils/inputSanitizer';
import { createCalendarEvent } from '../mcp-servers/calendarMCP';
import { extractExplicitReplanInput } from '../utils/tripHelpers';
import fs from 'fs';

export const createOrUpdateUserTrip = async (message: string, userId: string, tripId?: string, requestId?: string) => {
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    const err = new Error('Message cannot be empty.');
    (err as any).statusCode = 400;
    throw err;
  }

  if (!isMessageSafe(message)) {
    const err = new Error('Your message contains disallowed content. Please describe your travel plans naturally.');
    (err as any).statusCode = 400;
    throw err;
  }

  if (tripId !== undefined && (typeof tripId !== 'string' || tripId.trim().length === 0)) {
    const err = new Error('Invalid trip session ID.');
    (err as any).statusCode = 400;
    throw err;
  }

  if (tripId) {
    const existingTrip = await Trip.findOne({ sessionId: tripId, userId });
    if (existingTrip && existingTrip.status === 'CONFIRMED') {
      const err = new Error('This trip has already been confirmed and booked. Modifications are not allowed on confirmed itineraries.');
      (err as any).statusCode = 400;
      throw err;
    }
  }

  try {
    return await planTrip(message.trim(), userId, tripId, requestId);
  } catch (error: any) {
    try {
      fs.appendFileSync(
        'd:/Presidio Capstone Project/server/errors.log',
        `[${new Date().toISOString()}] Service error: ${error?.message || String(error)}\nStack: ${error?.stack}\n`
      );
    } catch (err) {}
    logger.error('Trip planning failed', { error, userId });
    throw error;
  }
};

export const approveUserTripItinerary = async (tripId: string, userId: string) => {
  const trip = await Trip.findOne({ sessionId: tripId, userId });
  if (!trip) {
    const err = new Error('Trip not found');
    (err as any).statusCode = 404;
    throw err;
  }

  if (trip.status !== 'PLANNED') {
    const err = new Error('This trip is currently in draft status (or already confirmed/canceled) and cannot be approved.');
    (err as any).statusCode = 400;
    throw err;
  }

  if (trip.budget && !trip.budget.is_feasible) {
    const err = new Error('This trip exceeds your budget constraint and cannot be confirmed. Please select cheaper options or adjust your budget parameters.');
    (err as any).statusCode = 400;
    throw err;
  }

  const user = await User.findById(userId);
  const context = trip.toObject() as any;

  // Ensure itinerary exists prior to final booking & approval!
  if (!trip.itinerary || !trip.itinerary.days || trip.itinerary.days.length === 0) {
    logger.info('Itinerary is missing/empty during trip approval; generating now.');
    try {
      const generatedItinerary = await runItineraryAgent(context);
      const transitResult = await runLocalTransitAgent(generatedItinerary, context);
      trip.itinerary = transitResult.itinerary;
      trip.budget = transitResult.budget;
      trip.local_transport = transitResult.local_transport;

      context.itinerary = transitResult.itinerary;
      context.budget = transitResult.budget;
      context.local_transport = transitResult.local_transport;

      // Regenerate markdown plan overview
      const newFormattedPlan = await synthesizeTripPlan(context);
      trip.formattedPlan = newFormattedPlan;

      if (Array.isArray(trip.conversationHistory)) {
        let updatedPlanInHistory = false;
        for (let i = trip.conversationHistory.length - 1; i >= 0; i--) {
          if (trip.conversationHistory[i].role === 'assistant' &&
              (trip.conversationHistory[i].content.includes('Here is your trip plan:') ||
               trip.conversationHistory[i].content.includes('## ✈️') ||
               trip.conversationHistory[i].content.includes('## ✈️ Trip to'))) {
            trip.conversationHistory[i].content = `Here is your trip plan:\n\n${newFormattedPlan}`;
            updatedPlanInHistory = true;
            break;
          }
        }
        if (!updatedPlanInHistory) {
          trip.conversationHistory.push({ role: 'assistant', content: `Here is your trip plan:\n\n${newFormattedPlan}` });
        }
      }
    } catch (err: any) {
      logger.error('Failed to generate itinerary during trip approval stage', err);
    }
  }

  const booking = await runBookingAgent(context, user?.email || '');

  // Update trip to CONFIRMED status in MongoDB
  trip.status = 'CONFIRMED';
  trip.booking = { refs: booking.bookingRefs, confirmed_at: new Date() };
  await trip.save();

  // Re-fetch the fully saved document
  const confirmedTrip = await Trip.findOne({ sessionId: tripId, userId });

  return { bookingRefs: booking.bookingRefs, status: 'CONFIRMED', trip: confirmedTrip };
};

export const rejectUserTripItinerary = async (tripId: string, reason: string, userId: string, requestId?: string) => {
  const trip = await Trip.findOne({ sessionId: tripId, userId });
  if (!trip) {
    const err = new Error('Trip not found');
    (err as any).statusCode = 404;
    throw err;
  }

  if (trip.status === 'CONFIRMED') {
    const err = new Error('This trip has already been confirmed and booked. Modifications are not allowed on confirmed itineraries.');
    (err as any).statusCode = 400;
    throw err;
  }

  const context = trip.toObject() as any;
  const { updatedContext } = await runReplanningAgent(context, reason);
  const explicitInput = extractExplicitReplanInput(reason);

  updatedContext.input = {
    ...(updatedContext.input || {}),
    ...(explicitInput.destination ? { destination: explicitInput.destination } : {}),
    ...(explicitInput.origin ? { origin: explicitInput.origin } : {}),
  };

  // Always clear the itinerary when replanning so it gets freshly regenerated
  updatedContext.itinerary = undefined;
  updatedContext.formattedPlan = undefined;

  // Save modified context to ensure intermediate variables are updated
  await Trip.findOneAndUpdate(
    { sessionId: tripId },
    {
      status: 'DRAFT',
      input: updatedContext.input,
      weather: updatedContext.weather,
      transport: updatedContext.transport,
      accommodation: updatedContext.accommodation,
      activities: updatedContext.activities,
      budget: updatedContext.budget,
      itinerary: undefined,
      local_transport: undefined, // clear stale transit
      formattedPlan: undefined,
    }
  );

  // Build an enriched message
  const currentInput = updatedContext.input || {};
  const destinationChanged = !!explicitInput.destination || /\b(?:change|update|set|switch)\s+(?:the\s+)?destination\b/i.test(reason);
  const enrichedMessage = [
    reason,
    explicitInput.destination ? `Destination: ${explicitInput.destination}` : '',
    !destinationChanged && currentInput.destination ? `Destination: ${currentInput.destination}` : '',
    currentInput.origin ? `Origin: ${currentInput.origin}` : '',
    currentInput.start_date ? `Start date: ${currentInput.start_date}` : '',
    currentInput.end_date ? `Current end date: ${currentInput.end_date}` : '',
    currentInput.travelers ? `Travelers: ${currentInput.travelers}` : '',
    currentInput.budget_inr ? `Budget: ₹${currentInput.budget_inr}` : '',
  ].filter(Boolean).join('. ');

  // Re-run planning from coordinator stage
  return await planTrip(enrichedMessage, userId, tripId, requestId);
};

export const getTripsByUser = async (userId: string) => {
  return await Trip.find({ userId })
    .select('sessionId status input.destination input.start_date input.end_date input.budget_inr input.travelers createdAt')
    .sort({ createdAt: -1 })
    .limit(20);
};

export const getTripByIdAndUser = async (tripId: string, userId: string) => {
  const trip = await Trip.findOne({ sessionId: tripId, userId });
  if (!trip) {
    const err = new Error('Trip not found');
    (err as any).statusCode = 404;
    throw err;
  }
  return trip;
};

export const cancelTripByUser = async (tripId: string, userId: string) => {
  const trip = await Trip.findOne({ sessionId: tripId, userId });
  if (!trip) {
    const err = new Error('Trip not found or already removed.');
    (err as any).statusCode = 404;
    throw err;
  }
  if (trip.status === 'CONFIRMED') {
    const err = new Error('Confirmed and booked trips cannot be cancelled or discarded.');
    (err as any).statusCode = 400;
    throw err;
  }

  trip.status = 'CANCELLED';
  await trip.save();
};

export const selectHotelChoice = async (tripId: string, userId: string, hotelName: string, category: string) => {
  const trip = await Trip.findOne({ sessionId: tripId, userId });
  if (!trip) {
    const err = new Error('Trip not found');
    (err as any).statusCode = 404;
    throw err;
  }

  if (trip.status === 'CONFIRMED') {
    const err = new Error('This trip has already been confirmed and booked. Modifications are not allowed on confirmed itineraries.');
    (err as any).statusCode = 400;
    throw err;
  }

  if (!hotelName || typeof hotelName !== 'string') {
    const err = new Error('Hotel name is required and must be a string.');
    (err as any).statusCode = 400;
    throw err;
  }

  if (!category || !['budget', 'mid_range', 'luxury', 'skipped'].includes(category)) {
    const err = new Error('Valid hotel category is required (budget, mid_range, luxury, skipped).');
    (err as any).statusCode = 400;
    throw err;
  }

  const accommodation = trip.accommodation || {};
  let selectedHotel: any = null;

  if (category === 'skipped' || hotelName === 'Self Arranged') {
    selectedHotel = {
      name: 'Self Arranged',
      price_per_night_inr: 0,
      rating: 5.0,
      amenities: ['Managed by Traveler'],
      total_cost_inr: 0
    };
  } else {
    const hotels = Array.isArray(accommodation.hotels) ? accommodation.hotels : [];
    selectedHotel = hotels.find((h: any) => h.name === hotelName);

    if (!selectedHotel) {
      const err = new Error(`Hotel "${hotelName}" was not found in the search options for this trip.`);
      (err as any).statusCode = 400;
      throw err;
    }
  }

  const oldHotelName = accommodation.recommended || '';

  // Update accommodation values
  accommodation.selected_category = category;
  accommodation.selected_hotel = selectedHotel;
  accommodation.recommended = selectedHotel.name;
  accommodation.price_per_night = selectedHotel.price_per_night_inr;

  if (category !== 'skipped') {
    const hotels = Array.isArray(accommodation.hotels) ? accommodation.hotels : [];
    const originalIdx = hotels.findIndex((h: any) => h.name === selectedHotel.name);
    if (originalIdx > -1) {
      const [removed] = hotels.splice(originalIdx, 1);
      hotels.unshift(removed);
    }
    accommodation.hotels = hotels;
  }
  trip.accommodation = accommodation;

  // Update hotel name in existing itinerary and formattedPlan
  if (oldHotelName && oldHotelName !== hotelName && trip.itinerary) {
    try {
      let itineraryStr = JSON.stringify(trip.itinerary);
      itineraryStr = itineraryStr.split(oldHotelName).join(hotelName);
      trip.itinerary = JSON.parse(itineraryStr);
    } catch (e) {
      logger.error('Failed to update itinerary hotel name programmatically', e);
    }

    if (trip.formattedPlan) {
      trip.formattedPlan = trip.formattedPlan.split(oldHotelName).join(hotelName);
    }
  }

  let updatedItinerary = trip.itinerary;
  let finalBudget = trip.budget;
  let finalLocalTransport = trip.local_transport;

  try {
    const tempContext = trip.toObject() as any;
    tempContext.budget = await runBudgetAgent(tempContext);

    if (!updatedItinerary || !updatedItinerary.days || updatedItinerary.days.length === 0) {
      logger.info('Itinerary is missing/undefined in select-hotel. Running Itinerary Agent.');
      updatedItinerary = await runItineraryAgent(tempContext);
      tempContext.itinerary = updatedItinerary;
    }

    const transitResult = await runLocalTransitAgent(updatedItinerary, tempContext);
    updatedItinerary = transitResult.itinerary;
    finalBudget = transitResult.budget;
    finalLocalTransport = transitResult.local_transport;
  } catch (enrichErr: any) {
    logger.error('Failed to re-enrich hotel local transport details', enrichErr);
    const tempContext = trip.toObject() as any;
    finalBudget = await runBudgetAgent(tempContext);
  }

  trip.budget = finalBudget;
  trip.itinerary = updatedItinerary;
  trip.local_transport = finalLocalTransport;

  const newBudget = finalBudget;

  if (!newBudget.is_feasible) {
    trip.status = 'DRAFT';
    const altMessage = `⚠️ **Budget Constraint Exceeded with hotel selection!**\n\nYour selected hotel **${selectedHotel.name}** exceeds your budget limit of **₹${trip.input.budget_inr?.toLocaleString()}**. The updated total estimated cost is now **₹${newBudget.total_cost_inr?.toLocaleString()}**.\n\nYou can select a cheaper option or adjust your budget ceiling.`;
    trip.conversationHistory.push({ role: 'assistant', content: altMessage });

    trip.formattedPlan = `⚠️ **Budget Constraint Exceeded!**\n\nThe selected hotel **${selectedHotel.name}** exceeds your budget ceiling of **₹${trip.input.budget_inr?.toLocaleString()}** by **₹${Math.abs(newBudget.remaining_budget_inr || 0).toLocaleString()}**.\n\nPlease select a cheaper option or increase your budget size to resolve this and generate the plan properly.`;
  } else {
    trip.status = 'PLANNED';
    const successMessage = category === 'skipped'
      ? `🏨 Accommodation has been skipped (Self Arranged). The updated total trip cost is **₹${newBudget.total_cost_inr?.toLocaleString()}** (within your ₹${trip.input.budget_inr?.toLocaleString()} budget).`
      : `🏨 Selected **${selectedHotel.name}** (${category.toUpperCase()} tier). The updated total trip cost is **₹${newBudget.total_cost_inr.toLocaleString()}** (within your ₹${trip.input.budget_inr?.toLocaleString()} budget).`;
    trip.conversationHistory.push({ role: 'assistant', content: successMessage });

    try {
      const tempContext = trip.toObject() as any;
      tempContext.itinerary = updatedItinerary;
      tempContext.budget = finalBudget;
      tempContext.local_transport = finalLocalTransport;

      const newFormattedPlan = await synthesizeTripPlan(tempContext);
      trip.formattedPlan = newFormattedPlan;

      let updatedPlanInHistory = false;
      if (Array.isArray(trip.conversationHistory)) {
        for (let i = trip.conversationHistory.length - 1; i >= 0; i--) {
          if (trip.conversationHistory[i].role === 'assistant' &&
              (trip.conversationHistory[i].content.includes('Here is your trip plan:') ||
               trip.conversationHistory[i].content.includes('## ✈️') ||
               trip.conversationHistory[i].content.includes('## ✈️ Trip to'))) {
            trip.conversationHistory[i].content = `Here is your trip plan:\n\n${newFormattedPlan}`;
            updatedPlanInHistory = true;
            break;
          }
        }
        if (!updatedPlanInHistory) {
          trip.conversationHistory.push({ role: 'assistant', content: `Here is your trip plan:\n\n${newFormattedPlan}` });
        }
      }
    } catch (synthErr) {
      logger.error('Failed to synthesize plan in select-hotel', synthErr);
      if (oldHotelName && oldHotelName !== hotelName && trip.formattedPlan) {
        trip.formattedPlan = trip.formattedPlan.split(oldHotelName).join(hotelName);
      }
    }
  }

  await Trip.findOneAndUpdate(
    { sessionId: tripId },
    {
      status: trip.status,
      accommodation: trip.accommodation,
      budget: trip.budget,
      local_transport: trip.local_transport,
      itinerary: trip.itinerary,
      formattedPlan: trip.formattedPlan,
      conversationHistory: trip.conversationHistory
    }
  );

  return await Trip.findOne({ sessionId: tripId });
};

export const selectTransportChoice = async (tripId: string, userId: string, operator: string, mode: string) => {
  const trip = await Trip.findOne({ sessionId: tripId, userId });
  if (!trip) {
    const err = new Error('Trip not found');
    (err as any).statusCode = 404;
    throw err;
  }

  if (trip.status === 'CONFIRMED') {
    const err = new Error('This trip has already been confirmed and booked. Modifications are not allowed on confirmed itineraries.');
    (err as any).statusCode = 400;
    throw err;
  }

  if (!operator || typeof operator !== 'string' || !mode || typeof mode !== 'string') {
    const err = new Error('Operator and mode are required and must be strings.');
    (err as any).statusCode = 400;
    throw err;
  }

  let selectedOption: any;
  const transport = trip.transport || {};
  const options = Array.isArray(transport.options) ? transport.options : [];

  if (operator === 'Self Arranged' && mode === 'skipped') {
    selectedOption = {
      operator: 'Self Arranged',
      mode: 'Self Arranged',
      cost_inr: 0,
      cost_per_traveler: 0,
      departure: 'N/A',
      arrival: 'N/A',
      duration_hrs: 0,
      source: 'Self Arranged'
    };

    const cleanOptions = options.filter((opt: any) => opt.operator !== 'Self Arranged');
    cleanOptions.unshift(selectedOption);

    transport.selected_option = selectedOption;
    transport.options = cleanOptions;
    trip.transport = transport;
  } else {
    selectedOption = options.find((opt: any) => opt.operator === operator && opt.mode === mode);

    if (!selectedOption) {
      const err = new Error(`Transport option "${operator}" (${mode}) was not found in the search options for this trip.`);
      (err as any).statusCode = 400;
      throw err;
    }

    transport.selected_option = selectedOption;

    const originalIdx = options.findIndex((opt: any) => opt.operator === selectedOption.operator && opt.mode === selectedOption.mode);
    if (originalIdx > -1) {
      const [removed] = options.splice(originalIdx, 1);
      options.unshift(removed);
    }
    transport.options = options;
    trip.transport = transport;
  }

  const contextObj = trip.toObject() as any;

  let isItineraryGeneratedNow = false;
  if (!contextObj.itinerary || !contextObj.itinerary.days || contextObj.itinerary.days.length === 0) {
    try {
      logger.info('Itinerary is missing/undefined in select-transport. Running Itinerary Agent.');
      contextObj.budget = await runBudgetAgent(contextObj);
      const generated = await runItineraryAgent(contextObj);
      const transitResult = await runLocalTransitAgent(generated, contextObj);
      contextObj.itinerary = transitResult.itinerary;
      contextObj.budget = transitResult.budget;
      contextObj.local_transport = transitResult.local_transport;
      isItineraryGeneratedNow = true;
    } catch (err: any) {
      logger.error('Failed to generate or enrich itinerary in select-transport', err);
    }
  }

  const newBudget = isItineraryGeneratedNow ? contextObj.budget : await runBudgetAgent(contextObj);

  if (!isItineraryGeneratedNow) {
    const existingLocalTransportCost = Number(trip.budget?.local_transport) || 0;
    if (existingLocalTransportCost > 0) {
      const travelers = trip.input?.travelers || 1;
      const tripDayCount = trip.itinerary?.days?.length || 5;
      const cap = 500 * travelers * tripDayCount;
      const safeLocalCost = Math.min(existingLocalTransportCost, cap);

      newBudget.local_transport = safeLocalCost;
      const subtotal = (newBudget.transport || 0) + (newBudget.accommodation || 0) + (newBudget.food || 0) + (newBudget.activities || 0) + safeLocalCost;
      newBudget.emergency_fund = Math.round(subtotal * 0.1);
      newBudget.total_cost_inr = subtotal + newBudget.emergency_fund;
      newBudget.remaining_budget_inr = (trip.input.budget_inr || 30000) - newBudget.total_cost_inr;
      newBudget.is_feasible = newBudget.total_cost_inr <= (trip.input.budget_inr || 30000);
      if (!newBudget.is_feasible) {
        const safeIncrease = Math.ceil(newBudget.total_cost_inr * 1.15);
        const alternatives: string[] = [];
        const selectedTier = trip.accommodation?.selected_category || 'mid_range';

        if (selectedTier !== 'budget' && selectedTier !== 'skipped' && (newBudget.accommodation || 0) > 0) {
          alternatives.push(`Choose a cheaper hotel tier (saves approx. ₹${Math.round((newBudget.accommodation || 0) * 0.4)})`);
        }

        if (selectedTier !== 'skipped' && (newBudget.accommodation || 0) > 0) {
          alternatives.push(`Skip lodgings: arrange accommodation yourself (saves ₹${Math.round(newBudget.accommodation || 0)})`);
        }

        if (tripDayCount > 2) {
          alternatives.push(`Reduce duration of trip by 1 or 2 days (saves approx. ₹${Math.round(((newBudget.food || 0) / Math.max(1, tripDayCount)) * 1.5)})`);
        }

        if (travelers > 1) {
          alternatives.push(`Reduce travelers count from ${travelers} to ${travelers - 1} (saves approx. ₹${Math.round(newBudget.total_cost_inr / travelers)})`);
        }

        if ((newBudget.activities || 0) > 0) {
          alternatives.push(`Focus on free tourist attractions (saves up to ₹${Math.round(newBudget.activities || 0)})`);
        }

        alternatives.push(`Increase limit to ₹${safeIncrease} for comfortable traveling accommodations`);

        newBudget.alternatives = alternatives;
      }
    }
  }
  trip.budget = newBudget;
  if (isItineraryGeneratedNow) {
    trip.itinerary = contextObj.itinerary;
    trip.local_transport = contextObj.local_transport;
  }

  if (!newBudget.is_feasible) {
    trip.status = 'DRAFT';
    const altMessage = `⚠️ **Budget Constraint Exceeded with transport selection!**\n\nYour selected transport **${selectedOption.operator} (${selectedOption.mode})** exceeds your budget limit of **₹${trip.input.budget_inr?.toLocaleString()}**. The updated total estimated cost is now **₹${newBudget.total_cost_inr?.toLocaleString()}**.\n\nYou can select a cheaper option or adjust your budget ceiling.`;
    trip.conversationHistory.push({ role: 'assistant', content: altMessage });

    trip.formattedPlan = `⚠️ **Budget Constraint Exceeded!**\n\nThe selected transport **${selectedOption.operator} (${selectedOption.mode})** exceeds your budget ceiling of **₹${trip.input.budget_inr?.toLocaleString()}** by **₹${Math.abs(newBudget.remaining_budget_inr || 0).toLocaleString()}**.\n\nPlease select a cheaper option or increase your budget size to resolve this and generate the plan properly.`;
  } else {
    trip.status = 'PLANNED';
    const successMessage = `🎫 Selected **${selectedOption.operator} (${selectedOption.mode})**. The updated total trip cost is **₹${newBudget.total_cost_inr.toLocaleString()}** (within your ₹${trip.input.budget_inr?.toLocaleString()} budget).`;
    trip.conversationHistory.push({ role: 'assistant', content: successMessage });

    try {
      const tempContext = trip.toObject() as any;
      tempContext.itinerary = trip.itinerary;
      tempContext.budget = trip.budget;
      tempContext.local_transport = trip.local_transport;

      const newFormattedPlan = await synthesizeTripPlan(tempContext);
      trip.formattedPlan = newFormattedPlan;

      let updatedPlanInHistory = false;
      if (Array.isArray(trip.conversationHistory)) {
        for (let i = trip.conversationHistory.length - 1; i >= 0; i--) {
          if (trip.conversationHistory[i].role === 'assistant' &&
              (trip.conversationHistory[i].content.includes('Here is your trip plan:') ||
               trip.conversationHistory[i].content.includes('## ✈️') ||
               trip.conversationHistory[i].content.includes('## ✈️ Trip to'))) {
            trip.conversationHistory[i].content = `Here is your trip plan:\n\n${newFormattedPlan}`;
            updatedPlanInHistory = true;
            break;
          }
        }
        if (!updatedPlanInHistory) {
          trip.conversationHistory.push({ role: 'assistant', content: `Here is your trip plan:\n\n${newFormattedPlan}` });
        }
      }
    } catch (synthErr) {
      logger.error('Failed to regenerate travel plan synthesized markdown in selectTransport', synthErr);
    }
  }

  await Trip.findOneAndUpdate(
    { sessionId: tripId },
    {
      status: trip.status,
      transport: trip.transport,
      budget: trip.budget,
      itinerary: trip.itinerary,
      local_transport: trip.local_transport,
      formattedPlan: trip.formattedPlan,
      conversationHistory: trip.conversationHistory
    }
  );

  return await Trip.findOne({ sessionId: tripId });
};

export const fetchPlacePhoto = async (photoReference: string) => {
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes('REPLACE_WITH')) {
    const err = new Error('Google Maps API key is not configured.');
    (err as any).statusCode = 500;
    throw err;
  }

  const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoReference}&key=${GOOGLE_API_KEY}`;
  const response = await fetch(photoUrl);

  if (!response.ok) {
    const err = new Error('Failed to fetch image from Google Places API.');
    (err as any).statusCode = response.status;
    throw err;
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return { buffer, contentType };
};

export const syncTripCalendar = async (tripId: string, userId: string) => {
  const trip = await Trip.findOne({ sessionId: tripId, userId });
  if (!trip) {
    const err = new Error('Trip not found');
    (err as any).statusCode = 404;
    throw err;
  }

  if (trip.status !== 'CONFIRMED') {
    const err = new Error('Only confirmed trips can be synced to Google Calendar.');
    (err as any).statusCode = 400;
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    (err as any).statusCode = 404;
    throw err;
  }

  const context = trip.toObject() as any;

  try {
    const calendarResult = await createCalendarEvent(
      context.input.destination || 'India Tour',
      context.input.start_date!,
      context.input.end_date!,
      user.email
    );

    if (calendarResult.success && calendarResult.eventId) {
      const refs = trip.booking?.refs || {};
      refs.calendar = calendarResult.eventId;
      trip.booking = {
        ...trip.booking,
        refs,
        confirmed_at: trip.booking?.confirmed_at || new Date(),
      };
      await trip.save();

      return {
        success: true,
        message: calendarResult.message,
        calendarEventId: calendarResult.eventId,
      };
    } else {
      return {
        success: false,
        message: calendarResult.message || 'Failed to sync calendar (account might not be connected).'
      };
    }
  } catch (calendarErr: any) {
    logger.error('Google Calendar event creation failed during manual sync', calendarErr);
    throw calendarErr;
  }
};
