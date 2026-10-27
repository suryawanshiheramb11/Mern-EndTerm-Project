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

export const createRazorpayOrder = async (chargeId, amountPaise) => data(await api.post('/me/payments/razorpay/order', { chargeId, amountPaise })).order;
export const verifyRazorpayPayment = async (response) => data(await api.post('/me/payments/razorpay/verify', response));
export const updateMyDetails = async (body) => data(await api.patch('/me/details', body)).resident;
