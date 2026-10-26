import api from './api.js';

const data = (res) => res.data.data;
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v));

export const listResidents = async (filters = {}) => data(await api.get('/residents', { params: { limit: 100, ...clean(filters) } }));
export const getResident = async (id) => data(await api.get(`/residents/${id}`)).resident;
export const createResident = async (body) => data(await api.post('/residents', body)).resident;
export const inviteResident = async (id) => data(await api.post(`/residents/${id}/invite`));

export const listStays = async (filters = {}) => data(await api.get('/stays', { params: { limit: 200, ...clean(filters) } }));
export const createStay = async (body) => data(await api.post('/stays', body));
export const transferStay = async (id, body) => data(await api.post(`/stays/${id}/transfer`, body));
