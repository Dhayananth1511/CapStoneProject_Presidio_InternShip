import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createOrUpdateTrip, approveTrip, rejectTrip,
  getUserTrips, getTripById, cancelTrip
} from '../controllers/tripController';

const router = Router();

// Guard 1: Must be authenticated
// Guard 2: Must be a Traveler (not Admin) — per the brief, only Travelers
//          can create, view, and manage their own trip plans.
router.use(authenticate);

router.post('/plan', createOrUpdateTrip);
router.get('/', getUserTrips);
router.get('/:tripId', getTripById);
router.post('/:tripId/approve', approveTrip);
router.post('/:tripId/reject', rejectTrip);
router.delete('/:tripId', cancelTrip);

export default router;
