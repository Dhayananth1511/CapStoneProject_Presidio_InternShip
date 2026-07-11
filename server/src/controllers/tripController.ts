import { Request, Response } from 'express';
import { planTrip } from '../services/plannerService';
import { runBookingAgent } from '../agents/bookingAgent';
import { runReplanningAgent } from '../agents/replanningAgent';
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
  } catch (error) {
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
