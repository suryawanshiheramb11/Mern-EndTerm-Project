import api from './api.js';

const data = (res) => res.data.data;

export const getSummary = async () => data(await api.get('/me/summary')).summary;
export const getProfile = async () => data(await api.get('/me/profile'));
export const listMyCharges = async () => data(await api.get('/me/charges', { params: { limit: 100 } }));
export const listMyPayments = async () => data(await api.get('/me/payments', { params: { limit: 100 } }));
export const listMyRefunds = async () => data(await api.get('/me/refunds', { params: { limit: 100 } }));
export const listMyComplaints = async () => data(await api.get('/me/complaints', { params: { limit: 100 } }));

export const listNotifications = async (params = {}) => data(await api.get('/me/notifications', { params: { limit: 50, ...params } }));
export const markNotificationRead = async (id) => data(await api.post(`/me/notifications/${id}/read`)).notification;
