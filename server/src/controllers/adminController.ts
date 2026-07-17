import { Request, Response } from 'express';
import * as adminService from '../services/adminService';

// GET /api/admin/trips — View ALL trips across all users (admin only)
export const getAllTrips = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, destination, page = 1, limit = 20 } = req.query;
    const result = await adminService.getPaginatedTrips(
      status,
      destination,
      Number(page),
      Number(limit)
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch trips' });
  }
};

// GET /api/admin/analytics — Dashboard stats for charts
export const getAnalytics = async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getAnalyticsDashboardStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Analytics failed' });
  }
};

// GET /api/admin/logs — Retrieve application logs (admin only)
export const getSystemLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Number(req.query.limit) || 200;
    const logs = await adminService.readSystemLogs(limit);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to retrieve system logs', error: error.message });
  }
};
