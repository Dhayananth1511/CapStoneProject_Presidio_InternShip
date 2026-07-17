import api from '../lib/axios';

export const tripService = {
  async getTrips() {
    const res = await api.get('/trips');
    return res.data;
  },

  async getTripById(tripId: string) {
    const res = await api.get(`/trips/${tripId}`);
    return res.data;
  },

  async planTrip(payload: { message: string; tripId?: string }) {
    const res = await api.post('/trips/plan', payload);
    return res.data;
  },

  async selectHotel(tripId: string, payload: { hotelName: string; category: string }) {
    const res = await api.post(`/trips/${tripId}/select-hotel`, payload);
    return res.data;
  },

  async selectTransport(tripId: string, payload: { operator: string; mode: string }) {
    const res = await api.post(`/trips/${tripId}/select-transport`, payload);
    return res.data;
  },

  async approveTrip(tripId: string) {
    const res = await api.post(`/trips/${tripId}/approve`);
    return res.data;
  },

  async rejectTrip(tripId: string, reason: string) {
    const res = await api.post(`/trips/${tripId}/reject`, { reason });
    return res.data;
  },

  async deleteTrip(tripId: string) {
    const res = await api.delete(`/trips/${tripId}`);
    return res.data;
  },

  async syncCalendar(tripId: string) {
    const res = await api.post(`/trips/${tripId}/sync-calendar`);
    return res.data;
  },

  async getGoogleOAuthUrl(tripId?: string) {
    const res = await api.get(`/auth/google${tripId ? `?tripId=${tripId}` : ''}`);
    return res.data;
  },
};
