import api from '../lib/axios';

export const adminService = {
  async getLogs() {
    const res = await api.get('/admin/logs');
    return res.data;
  },

  async getAnalytics() {
    const res = await api.get('/admin/analytics');
    return res.data;
  },

  async getAdminTrips(params: { status?: string; destination?: string; page: number; limit: number }) {
    const res = await api.get('/admin/trips', { params });
    return res.data;
  },
};
