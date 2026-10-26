import api from './api.js';

export const getMe = async () => (await api.get('/auth/me')).data.data.user;
export const login = async (credentials) => (await api.post('/auth/login', credentials)).data.data.user;
export const register = async (payload) => (await api.post('/auth/register', payload)).data.data.user;
export const logout = async () => api.post('/auth/logout');
export const resetPassword = async (payload) => api.post('/auth/reset-password', payload);
