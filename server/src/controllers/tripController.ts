import { Request, Response } from 'express';
import logger from '../utils/logger';
import * as tripService from '../services/tripService';

// POST /api/trips/plan — User sends a chat message to plan a trip
export const createOrUpdateTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, tripId } = req.body;
    const userId = req.user!.userId;

    const result = await tripService.createOrUpdateUserTrip(
      message,
      userId,
      tripId as string | undefined,
      (req as any).requestId
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Trip planning failed', { error, userId: req.user?.userId });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || 'Trip planning failed. Please try again.' });
  }
};

// POST /api/trips/:tripId/approve — User approves the plan → trigger booking
export const approveTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const tripId = req.params.tripId as string;
    const userId = req.user!.userId as string;

    const result = await tripService.approveUserTripItinerary(tripId, userId);

    res.json({
      message: 'Trip confirmed!',
      bookingRefs: result.bookingRefs,
      status: result.status,
      trip: result.trip,
    });
  } catch (error: any) {
    logger.error('Trip approval failed', { error });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || 'Booking failed. Please try again.' });
  }
};

// POST /api/trips/:tripId/reject — User rejects plan, provides modification request
export const rejectTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const tripId = req.params.tripId as string;
    const { reason } = req.body;
    const userId = req.user!.userId as string;

    const result = await tripService.rejectUserTripItinerary(
      tripId,
      reason as string,
      userId,
      (req as any).requestId
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Trip rejection/replan failed', { error });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || 'Replanning failed. Please try again.' });
  }
};

// GET /api/trips — Get all trips for logged-in user
export const getUserTrips = async (req: Request, res: Response): Promise<void> => {
  try {
    const trips = await tripService.getTripsByUser(req.user!.userId);
    res.json({ trips });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch trips' });
  }
};

// GET /api/trips/:tripId — Get single trip details
export const getTripById = async (req: Request, res: Response): Promise<void> => {
  try {
    const trip = await tripService.getTripByIdAndUser(req.params.tripId as string, req.user!.userId as string);
    res.json({ trip });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || 'Failed to fetch trip' });
  }
};

// DELETE /api/trips/:tripId — Cancel a trip
export const cancelTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const tripId = req.params.tripId as string;
    const userId = req.user!.userId as string;

    await tripService.cancelTripByUser(tripId, userId);
    res.json({ message: 'Trip cancelled' });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || 'Failed to cancel trip' });
  }
};

// POST /api/trips/:tripId/select-hotel — Choose preferred hotel tier and specific property
export const selectHotel = async (req: Request, res: Response): Promise<void> => {
  try {
    const tripId = req.params.tripId as string;
    const { hotelName, category } = req.body;
    const userId = req.user!.userId as string;

    const updatedTrip = await tripService.selectHotelChoice(tripId, userId, hotelName, category);

    res.json({
      message: 'Hotel selection updated successfully!',
      trip: updatedTrip,
    });
  } catch (error: any) {
    logger.error('Failed to process hotel selection', { error });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || 'Failed to update hotel selection. Please try again.' });
  }
};

// POST /api/trips/:tripId/select-transport — Choose preferred transport option
export const selectTransport = async (req: Request, res: Response): Promise<void> => {
  try {
    const tripId = req.params.tripId as string;
    const { operator, mode } = req.body;
    const userId = req.user!.userId as string;

    const updatedTrip = await tripService.selectTransportChoice(tripId, userId, operator, mode);

    res.json({
      message: 'Transport selection updated successfully!',
      trip: updatedTrip,
    });
  } catch (error: any) {
    logger.error('Failed to process transport selection', { error });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || 'Failed to update transport selection. Please try again.' });
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

    const { buffer, contentType } = await tripService.fetchPlacePhoto(photo_reference);

    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  } catch (error: any) {
    logger.error('Failed to proxy place photo', { error });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || 'Failed to proxy place photo.' });
  }
};

// POST /api/trips/:tripId/sync-calendar — Sync already confirmed trip to Google Calendar
export const syncCalendar = async (req: Request, res: Response): Promise<void> => {
  try {
    const tripId = req.params.tripId as string;
    const userId = req.user!.userId as string;

    const result = await tripService.syncTripCalendar(tripId, userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    logger.error('Failed to sync calendar', { error });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message || 'Failed to sync calendar.' });
  }
};
