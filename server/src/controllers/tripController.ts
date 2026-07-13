import { Request, Response } from 'express';
import { planTrip } from '../services/plannerService';
import { runBookingAgent } from '../agents/bookingAgent';
import { runReplanningAgent } from '../agents/replanningAgent';
import { runBudgetAgent } from '../agents/budgetAgent';
import Trip from '../models/Trip';
import User from '../models/User';
import logger from '../utils/logger';
import { isMessageSafe, validateTripDates } from '../utils/inputSanitizer';

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

    const user = await User.findById(userId);
    const context = trip.toObject() as any;

    const booking = await runBookingAgent(context, user?.email || '');

    // Update trip to CONFIRMED status in MongoDB
    trip.status = 'CONFIRMED';
    trip.booking = { refs: booking.bookingRefs, confirmed_at: new Date() };
    await trip.save();

    res.json({ message: 'Trip confirmed!', bookingRefs: booking.bookingRefs, status: 'CONFIRMED' });
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

    // Save modified context to ensure intermediate variables are updated
    await Trip.findOneAndUpdate(
      { sessionId: tripId },
      { 
        status: 'DRAFT',
        weather: updatedContext.weather,
        transport: updatedContext.transport,
        accommodation: updatedContext.accommodation,
        activities: updatedContext.activities,
        local_transport: updatedContext.local_transport,
        budget: updatedContext.budget,
        itinerary: updatedContext.itinerary,
        formattedPlan: undefined
      }
    );

    // Re-run planning from coordinator stage with updated context
    const result = await planTrip(reason as string, userId, tripId as string, (req as any).requestId);

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

    // Re-run budget agent on the updated context
    const contextObj = trip.toObject() as any;
    const newBudget = await runBudgetAgent(contextObj);
    trip.budget = newBudget;

    // Check if new budget exceeds/is feasible. Even if infeasible, we save the selection so they see it
    if (!newBudget.is_feasible) {
      trip.status = 'DRAFT';
      const altMessage = `⚠️ **Budget Constraint Exceeded with hotel selection!**\n\nYour selected hotel **${selectedHotel.name}** exceeds your budget limit of **₹${trip.input.budget_inr?.toLocaleString()}**. The updated total estimated cost is now **₹${newBudget.total_cost_inr?.toLocaleString()}**.\n\nYou can select a cheaper option or adjust your budget ceiling.`;
      trip.conversationHistory.push({ role: 'assistant', content: altMessage });
    } else {
      trip.status = 'PLANNED';
      const successMessage = category === 'skipped'
        ? `🏨 Accommodation has been skipped (Self Arranged). The updated total trip cost is **₹${newBudget.total_cost_inr?.toLocaleString()}** (within your ₹${trip.input.budget_inr?.toLocaleString()} budget).`
        : `🏨 Selected **${selectedHotel.name}** (${category.toUpperCase()} tier). The updated total trip cost is **₹${newBudget.total_cost_inr.toLocaleString()}** (within your ₹${trip.input.budget_inr?.toLocaleString()} budget).`;
      trip.conversationHistory.push({ role: 'assistant', content: successMessage });
    }

    // Programmatically update the itinerary and formattedPlan text, avoiding full LLM regeneration
    if (oldHotelName && oldHotelName !== hotelName) {
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

    // Save changes to database
    await Trip.findOneAndUpdate(
      { sessionId: tripId },
      {
        status: trip.status,
        accommodation: trip.accommodation,
        budget: trip.budget,
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
