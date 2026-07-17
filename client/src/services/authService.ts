import api from '../lib/axios';
import type { LoginFormData, RegisterFormData } from '../schemas/authSchemas';

export const authService = {
  async login(data: LoginFormData & { role: 'traveler' | 'admin' }) {
    const res = await api.post('/auth/login', data);
    return res.data;
  },

  async register(data: RegisterFormData) {
    const res = await api.post('/auth/register', {
      name: data.name,
      email: data.email,
      password: data.password,
    });
    return res.data;
  },

  async getGoogleLoginUrl(mode: 'login' | 'register') {
    const res = await api.get(`/auth/google-login?mode=${mode}`);
    return res.data;
  },

  async refreshSession() {
    const res = await api.post('/auth/refresh');
    return res.data;
  },
};
