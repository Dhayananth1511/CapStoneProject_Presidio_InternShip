import { Router } from 'express';
import { authenticate, authorizeAdmin } from '../middleware/auth';
import { getAllTrips, getAnalytics, getSystemLogs } from '../controllers/adminController';

const router = Router();

// Both middlewares run: first verify JWT, then verify admin role
router.use(authenticate, authorizeAdmin);

router.get('/trips', getAllTrips);
router.get('/analytics', getAnalytics);
router.get('/logs', getSystemLogs);

export default router;
