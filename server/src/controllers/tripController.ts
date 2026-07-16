import { Request, Response } from 'express';
import { planTrip } from '../services/plannerService';
import { runBookingAgent } from '../agents/bookingAgent';
import { runReplanningAgent } from '../agents/replanningAgent';
import { runBudgetAgent } from '../agents/budgetAgent';
import { runLocalTransitAgent } from '../agents/localTransitAgent';
import { runItineraryAgent } from '../agents/itineraryAgent';
import { synthesizeTripPlan } from '../agents/coordinatorAgent';
import Trip from '../models/Trip';
import User from '../models/User';
import logger from '../utils/logger';
import { isMessageSafe } from '../utils/inputSanitizer';

const cleanCityName = (value?: string): string | undefined => {
  if (!value) return undefined;
  const city = value
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\b(?:from|and|with|for|on|before|after|please|replan)\b.*$/i, '')
    .trim();

  if (!/[a-zA-Z]{2,}/.test(city)) return undefined;
  return city
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const extractExplicitReplanInput = (reason: string): { destination?: string; origin?: string } => {
  const destinationPatterns = [
    /\bdestination\s+(?:from\s+)?[a-zA-Z][a-zA-Z\s.'-]{1,50}?\s+to\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
    /\b(?:change|update|set|switch)\s+(?:the\s+)?destination\s+(?:from\s+)?[a-zA-Z][a-zA-Z\s.'-]{1,50}?\s+to\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
    /\b(?:change|update|set|switch)\s+(?:the\s+)?destination\s+(?:to|as|is)?\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
    /\bdestination\s+(?:is|to|as)\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
    /\b(?:go|travel|trip|plan)(?:ing)?\s+(?:to|for)\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
  ];
  const originPatterns = [
    /\b(?:departure|depature|origin|from|starting\s+from|start\s+from)\s+(?:city\s+)?(?:is|to|as)?\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
  ];

  const destination = cleanCityName(destinationPatterns.map((pattern) => reason.match(pattern)?.[1]).find(Boolean));
  const origin = cleanCityName(originPatterns.map((pattern) => reason.match(pattern)?.[1]).find(Boolean));

  return { destination, origin };
};

// POST /api/trips/plan — User sends a chat message to plan a trip
export const createOrUpdateTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, tripId } = req.body;
    const userId = req.user!.userId;

    // Guard 1: message must be a non-empty string
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ message: 'Message cannot be empty.' });
      return;
    }

    // Guard 2: message must not be a prompt injection attack
    if (!isMessageSafe(message)) {
      res.status(400).json({ message: 'Your message contains disallowed content. Please describe your travel plans naturally.' });
      return;
    }

    // Guard 3: if a tripId is provided it must be a non-empty string (UUID format)
    if (tripId !== undefined && (typeof tripId !== 'string' || tripId.trim().length === 0)) {
      res.status(400).json({ message: 'Invalid trip session ID.' });
      return;
    }

    // Guard 4: if a tripId is provided, the trip must not already be confirmed/booked
    if (tripId) {
      const existingTrip = await Trip.findOne({ sessionId: tripId, userId });
      if (existingTrip && existingTrip.status === 'CONFIRMED') {
        res.status(400).json({ message: 'This trip has already been confirmed and booked. Modifications are not allowed on confirmed itineraries.' });
        return;
      }
    }

    const result = await planTrip(message.trim(), userId, tripId as string | undefined, (req as any).requestId);

    res.json(result);
  } catch (error: any) {
    try {
      const fs = require('fs');
      fs.appendFileSync('d:/Presidio Capstone Project/server/errors.log', `[${new Date().toISOString()}] Controller error: ${error?.message || String(error)}\nStack: ${error?.stack}\n`);
    } catch (err) {}
    logger.error('Trip planning failed', { error, userId: req.user?.userId });
    res.status(500).json({ message: 'Trip planning failed. Please try again.' });
  }
};

// POST /api/trips/:tripId/approve — User approves the plan → trigger booking
export const approveTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.userId;

    const trip = await Trip.findOne({ sessionId: tripId, userId });
    if (!trip) { 
      res.status(404).json({ message: 'Trip not found' }); 
      return; 
    }

    if (trip.status !== 'PLANNED') {
      res.status(400).json({ message: 'This trip is currently in draft status (or already confirmed/canceled) and cannot be approved.' });
      return;
    }

    if (trip.budget && !trip.budget.is_feasible) {
      res.status(400).json({ message: 'This trip exceeds your budget constraint and cannot be confirmed. Please select cheaper options or adjust your budget parameters.' });
      return;
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

    // Re-fetch the fully saved document so the frontend gets the complete trip context
    const confirmedTrip = await Trip.findOne({ sessionId: tripId, userId });

    res.json({ message: 'Trip confirmed!', bookingRefs: booking.bookingRefs, status: 'CONFIRMED', trip: confirmedTrip });
  } catch (error) {
    logger.error('Trip approval failed', { error });
    res.status(500).json({ message: 'Booking failed. Please try again.' });
  }
};

// POST /api/trips/:tripId/reject — User rejects plan, provides modification request
export const rejectTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tripId } = req.params;
    const { reason } = req.body;
    const userId = req.user!.userId;

    const trip = await Trip.findOne({ sessionId: tripId, userId });
    if (!trip) { 
      res.status(404).json({ message: 'Trip not found' }); 
      return; 
    }

    if (trip.status === 'CONFIRMED') {
      res.status(400).json({ message: 'This trip has already been confirmed and booked. Modifications are not allowed on confirmed itineraries.' });
      return;
    }

    const context = trip.toObject() as any;
    const { updatedContext } = await runReplanningAgent(context, reason as string);
    const explicitInput = extractExplicitReplanInput(reason as string);

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
        local_transport: undefined,  // clear stale transit — LocalTransitAgent will repopulate
        formattedPlan: undefined,
      }
    );

    // Build an enriched message that includes current trip context so the slot extractor
    // can correctly parse date adjustments (e.g., "add 1 day") against current end_date.
    const currentInput = updatedContext.input || {};
    const destinationChanged = !!explicitInput.destination || /\b(?:change|update|set|switch)\s+(?:the\s+)?destination\b/i.test(reason as string);
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

    // Re-run planning from coordinator stage with updated context and enriched message
    const result = await planTrip(enrichedMessage, userId, tripId as string, (req as any).requestId);

    res.json(result);
  } catch (error) {
    logger.error('Trip rejection/replan failed', { error });
    res.status(500).json({ message: 'Replanning failed. Please try again.' });
  }
};

// GET /api/trips — Get all trips for logged-in user
export const getUserTrips = async (req: Request, res: Response): Promise<void> => {
  try {
    const trips = await Trip.find({ userId: req.user!.userId })
      .select('sessionId status input.destination input.start_date input.end_date input.budget_inr input.travelers createdAt')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ trips });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch trips' });
  }
};

// GET /api/trips/:tripId — Get single trip details
export const getTripById = async (req: Request, res: Response): Promise<void> => {
  try {
    const trip = await Trip.findOne({ sessionId: req.params.tripId, userId: req.user!.userId });
    if (!trip) { 
      res.status(404).json({ message: 'Trip not found' }); 
      return; 
    }
    res.json({ trip });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch trip' });
  }
};

// DELETE /api/trips/:tripId — Cancel a trip
export const cancelTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await Trip.findOneAndUpdate(
      { sessionId: req.params.tripId, userId: req.user!.userId },
      { status: 'CANCELLED' },
      { new: true }
    );
    // Return 404 if the trip didn't exist or doesn't belong to this user
    if (!result) {
      res.status(404).json({ message: 'Trip not found or already removed.' });
      return;
    }
    res.json({ message: 'Trip cancelled' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to cancel trip' });
  }
};

// POST /api/trips/:tripId/select-hotel — Choose preferred hotel tier and specific property
export const selectHotel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tripId } = req.params;
    const { hotelName, category } = req.body;
    const userId = req.user!.userId;

    const trip = await Trip.findOne({ sessionId: tripId, userId });
    if (!trip) {
      res.status(404).json({ message: 'Trip not found' });
      return;
    }

    if (trip.status === 'CONFIRMED') {
      res.status(400).json({ message: 'This trip has already been confirmed and booked. Modifications are not allowed on confirmed itineraries.' });
      return;
    }

    if (!hotelName || typeof hotelName !== 'string') {
      res.status(400).json({ message: 'Hotel name is required and must be a string.' });
      return;
    }

    if (!category || !['budget', 'mid_range', 'luxury', 'skipped'].includes(category)) {
      res.status(400).json({ message: 'Valid hotel category is required (budget, mid_range, luxury, skipped).' });
      return;
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
        res.status(400).json({ message: `Hotel "${hotelName}" was not found in the search options for this trip.` });
        return;
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
      // Shift selected hotel to the front of hotels list for compatibility with other agents
      const originalIdx = hotels.findIndex((h: any) => h.name === selectedHotel.name);
      if (originalIdx > -1) {
        const [removed] = hotels.splice(originalIdx, 1);
        hotels.unshift(removed);
      }
      accommodation.hotels = hotels;
    }
    trip.accommodation = accommodation;

    // Update hotel name in existing itinerary and formattedPlan BEFORE running transport enrichment
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

    // Enrich itinerary with local transportation costs & calibrate the budget to match the new hotel!
    let updatedItinerary = trip.itinerary;
    let finalBudget = trip.budget;
    let finalLocalTransport = trip.local_transport;

    try {
      const tempContext = trip.toObject() as any;
      tempContext.budget = await runBudgetAgent(tempContext);
      
      // If the itinerary is missing/undefined (e.g. planner aborted due to infeasible budget initially),
      // we must run runItineraryAgent now since we now have a feasible hotel choice!
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

    // Check if new budget exceeds/is feasible. Even if infeasible, we save the selection so they see it
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

      // Regenerate travel plan markdown to reflect the selected hotel and final budget calculation
      try {
        const tempContext = trip.toObject() as any;
        tempContext.itinerary = updatedItinerary;
        tempContext.budget = finalBudget;
        tempContext.local_transport = finalLocalTransport;
        
        const newFormattedPlan = await synthesizeTripPlan(tempContext);
        trip.formattedPlan = newFormattedPlan;

        // Find the last assistant message and update it
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

    // Save changes to database
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

    const updatedTrip = await Trip.findOne({ sessionId: tripId });

    res.json({
      message: 'Hotel selection updated successfully!',
      trip: updatedTrip
    });
  } catch (error: any) {
    logger.error('Failed to process hotel selection', { error });
    res.status(500).json({ message: 'Failed to update hotel selection. Please try again.' });
  }
};

// POST /api/trips/:tripId/select-transport — Choose preferred transport option
export const selectTransport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tripId } = req.params;
    const { operator, mode } = req.body;
    const userId = req.user!.userId;

    const trip = await Trip.findOne({ sessionId: tripId, userId });
    if (!trip) {
      res.status(404).json({ message: 'Trip not found' });
      return;
    }

    if (trip.status === 'CONFIRMED') {
      res.status(400).json({ message: 'This trip has already been confirmed and booked. Modifications are not allowed on confirmed itineraries.' });
      return;
    }

    if (!operator || typeof operator !== 'string' || !mode || typeof mode !== 'string') {
      res.status(400).json({ message: 'Operator and mode are required and must be strings.' });
      return;
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
        res.status(400).json({ message: `Transport option "${operator}" (${mode}) was not found in the search options for this trip.` });
        return;
      }

      // Update transport values
      transport.selected_option = selectedOption;

      // Shift selected option to the front of options list
      const originalIdx = options.findIndex((opt: any) => opt.operator === selectedOption.operator && opt.mode === selectedOption.mode);
      if (originalIdx > -1) {
        const [removed] = options.splice(originalIdx, 1);
        options.unshift(removed);
      }
      transport.options = options;
      trip.transport = transport;
    }

    // Re-run budget agent on the updated context and preserve local transport cost
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
      const existingLocalTransportCost = Number(trip.local_transport?.distances_from_hotel ? trip.budget?.local_transport : 0) || 0;
      if (existingLocalTransportCost > 0) {
        newBudget.local_transport = existingLocalTransportCost;
        const subtotal = (newBudget.transport || 0) + (newBudget.accommodation || 0) + (newBudget.food || 0) + (newBudget.activities || 0) + existingLocalTransportCost;
        newBudget.emergency_fund = Math.round(subtotal * 0.1);
        newBudget.total_cost_inr = subtotal + newBudget.emergency_fund;
        newBudget.remaining_budget_inr = (trip.input.budget_inr || 30000) - newBudget.total_cost_inr;
        newBudget.is_feasible = newBudget.total_cost_inr <= (trip.input.budget_inr || 30000);
        if (!newBudget.is_feasible) {
          newBudget.alternatives = [
            `Choose a cheaper hotel tier (saves approx. ₹${Math.round((newBudget.accommodation || 0) * 0.4)})`,
            `Reduce duration of trip by 1 or 2 days (saves approx. ₹${Math.round(((newBudget.food || 0) / Math.max(1, (trip.itinerary?.days?.length || 5))) * 1.5)})`,
            `Increase limit to ₹${newBudget.total_cost_inr} for comfortable traveling accommodations`,
          ];
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

      // Regenerate travel plan markdown to reflect the selected transport and final budget calculation
      try {
        const tempContext = trip.toObject() as any;
        tempContext.itinerary = trip.itinerary;
        tempContext.budget = trip.budget;
        tempContext.local_transport = trip.local_transport;
        
        const newFormattedPlan = await synthesizeTripPlan(tempContext);
        trip.formattedPlan = newFormattedPlan;

        // Find the last assistant message and update it
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

    // Save changes to database
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

    const updatedTrip = await Trip.findOne({ sessionId: tripId });

    res.json({
      message: 'Transport selection updated successfully!',
      trip: updatedTrip
    });
  } catch (error: any) {
    logger.error('Failed to process transport selection', { error });
    res.status(500).json({ message: 'Failed to update transport selection. Please try again.' });
  }
};

// GET /api/trips/place-photo — Proxy endpoint to fetch Google Places photos securely
export const getPlacePhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const { photo_reference } = req.query;
    if (!photo_reference || typeof photo_reference !== 'string') {
      res.status(400).json({ message: 'Photo reference is required.' });
      return;
    }

    const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes('REPLACE_WITH')) {
      res.status(500).json({ message: 'Google Maps API key is not configured.' });
      return;
    }

    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo_reference}&key=${GOOGLE_API_KEY}`;
    const response = await fetch(photoUrl);

    if (!response.ok) {
      res.status(response.status).json({ message: 'Failed to fetch image from Google Places API.' });
      return;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error: any) {
    logger.error('Failed to proxy place photo', { error });
    res.status(500).json({ message: 'Failed to proxy place photo.' });
  }
};
