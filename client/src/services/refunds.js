import api from './api.js';

const data = (res) => res.data.data;
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v));

export const previewCheckout = async (stayId, body) => data(await api.post(`/stays/${stayId}/checkout/preview`, body));
export const commitCheckout = async (stayId, body) => data(await api.post(`/stays/${stayId}/checkout`, body));

export const listRefunds = async (filters = {}) => data(await api.get('/refunds', { params: { limit: 100, ...clean(filters) } }));
export const approveRefund = async (id) => data(await api.post(`/refunds/${id}/approve`, {}));
export const payRefund = async (id, body) => data(await api.post(`/refunds/${id}/pay`, body));
export const cancelRefund = async (id) => data(await api.post(`/refunds/${id}/cancel`, {}));
