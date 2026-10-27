import api from './api.js';

export const getMe = async () => (await api.get('/auth/me')).data.data.user;
export const login = async (credentials) => (await api.post('/auth/login', credentials)).data.data.user;
export const register = async (payload) => (await api.post('/auth/register', payload)).data.data.user;
export const logout = async () => api.post('/auth/logout');
export const resetPassword = async (payload) => api.post('/auth/reset-password', payload);
export const getAuthConfig = async () => (await api.get('/auth/config')).data.data;
export const googleSignIn = async (credential, intent) => (await api.post('/auth/google', { credential, intent })).data.data.user;
export const requestOtp = async (email) => api.post('/auth/otp/request', { email });
export const verifyOtp = async (email, code) => (await api.post('/auth/otp/verify', { email, code })).data.data.user;
export const changePassword = async (body) => (await api.post('/auth/change-password', body)).data.data.user;
