import api from './api.js';

const data = (res) => res.data.data;
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== false));

export const listExpenses = async (filters = {}) => data(await api.get('/expenses', { params: { limit: 100, ...clean(filters) } }));
export const createExpense = async (body) => data(await api.post('/expenses', body)).expense;
export const updateExpense = async (id, body) => data(await api.patch(`/expenses/${id}`, body)).expense;
export const voidExpense = async (id, body) => data(await api.delete(`/expenses/${id}`, { data: body })).expense;
