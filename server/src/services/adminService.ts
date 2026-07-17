import path from 'path';
import fs from 'fs';
import Trip from '../models/Trip';
import User from '../models/User';

const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getPaginatedTrips = async (status?: any, destination?: any, page: number = 1, limit: number = 20) => {
  const query: any = {};
  if (status) query.status = status;
  if (destination) query['input.destination'] = new RegExp(escapeRegex(destination as string), 'i');

  const [trips, total] = await Promise.all([
    Trip.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit)),
    Trip.countDocuments(query),
  ]);

  return { trips, total, page: Number(page) };
};

export const getAnalyticsDashboardStats = async () => {
  const [statusCounts, topDestinations, avgBudget, totalUsers, totalTrips] = await Promise.all([
    Trip.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Trip.aggregate([
      { $group: { _id: '$input.destination', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Trip.aggregate([{ $group: { _id: null, avg: { $avg: '$input.budget_inr' } } }]),
    User.countDocuments({ role: 'traveler' }),
    Trip.countDocuments(),
  ]);

  return {
    statusCounts,
    topDestinations,
    avgBudget: avgBudget[0]?.avg || 0,
    totalUsers,
    totalTrips,
  };
};

export const readSystemLogs = async (limit: number = 200) => {
  const logFilePath = path.join(process.cwd(), 'logs', 'app.log');

  if (!fs.existsSync(logFilePath)) {
    return [];
  }

  const fileContent = fs.readFileSync(logFilePath, 'utf8');
  const lines = fileContent.trim().split('\n').filter(Boolean);
  const lastLines = lines.slice(-limit).reverse();

  return lastLines.map(line => {
    try {
      return JSON.parse(line);
    } catch (e) {
      return { message: line, timestamp: new Date().toISOString(), level: 'unknown' };
    }
  });
};
