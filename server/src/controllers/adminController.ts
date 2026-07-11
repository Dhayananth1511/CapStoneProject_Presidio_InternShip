import { Request, Response } from 'express';
import Trip from '../models/Trip';
import User from '../models/User';

/**
 * Escapes special regex metacharacters from a user-supplied string.
 * Prevents ReDoS attacks when using user input inside `new RegExp()`.
 */
const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/admin/trips — View ALL trips across all users (admin only)
export const getAllTrips = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, destination, page = 1, limit = 20 } = req.query;
    const query: any = {};
    if (status) query.status = status;
    // Escape user input before using in RegExp to prevent ReDoS
    if (destination) query['input.destination'] = new RegExp(escapeRegex(destination as string), 'i');

    const [trips, total] = await Promise.all([
      Trip.find(query)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit)),
      Trip.countDocuments(query),
    ]);

    res.json({ trips, total, page: Number(page) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch trips' });
  }
};

// GET /api/admin/analytics — Dashboard stats for charts
export const getAnalytics = async (_req: Request, res: Response): Promise<void> => {
  try {
    // MongoDB aggregation pipelines — all 5 queries run concurrently in a single round-trip
    const [statusCounts, topDestinations, avgBudget, totalUsers, totalTrips] = await Promise.all([
      // How many trips are in each status
      Trip.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

      // Most popular destinations
      Trip.aggregate([
        { $group: { _id: '$input.destination', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // Average trip budget
      Trip.aggregate([{ $group: { _id: null, avg: { $avg: '$input.budget_inr' } } }]),

      // Total registered users
      User.countDocuments(),

      // Total trips across all users
      Trip.countDocuments(),
    ]);

    res.json({
      statusCounts,
      topDestinations,
      avgBudget: avgBudget[0]?.avg || 0,
      totalUsers,
      totalTrips,
    });
  } catch (error) {
    res.status(500).json({ message: 'Analytics failed' });
  }
};
