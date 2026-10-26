import api from './api.js';

export const getHealth = async () => (await api.get('/health')).data;
