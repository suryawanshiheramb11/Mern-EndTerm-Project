import api from './api.js';

const data = (res) => res.data.data;
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v));

export const listCharges = async (filters = {}) => data(await api.get('/rent-charges', { params: { limit: 100, ...clean(filters) } }));
export const generateCharges = async (body) => data(await api.post('/rent-charges/generate', body));
export const adjustCharge = async (id, body) => data(await api.post(`/rent-charges/${id}/adjust`, body));
export const waiveCharge = async (id, body) => data(await api.post(`/rent-charges/${id}/waive`, body));
export const reconcileCharges = async (body) => data(await api.post('/rent-charges/reconcile', body));

export const listPayments = async (filters = {}) => data(await api.get('/payments', { params: { limit: 100, ...clean(filters) } }));
export const recordPayment = async (body) => data(await api.post('/payments', body));
export const reversePayment = async (id, body) => data(await api.post(`/payments/${id}/reverse`, body));
export const verifyPayment = async (id) => data(await api.post(`/payments/${id}/verify`));
export const getReceipt = async (id) => data(await api.get(`/payments/${id}/receipt`)).receipt;

export const getBalance = async (residentId) => data(await api.get(`/residents/${residentId}/balance`)).balance;

// Everything that depends on money must refresh together after a write.
export const invalidateRent = (queryClient) =>
  Promise.all(['rent-charges', 'rent-payments', 'balance'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
