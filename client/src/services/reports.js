import api from './api.js';

const data = (res) => res.data.data;
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null));
const get = async (path, params) => data(await api.get(`/reports/${path}`, { params: clean(params) }));

export const getOverview = async (propertyId, periodKey) => (await get('overview', { propertyId, periodKey })).overview;
export const getTrend = async (propertyId, months = 6) => (await get('trend', { propertyId, months })).trend;
export const getOccupancy = async (propertyId, range) => (await get('occupancy', { propertyId, ...range })).occupancy;
export const getCollections = async (propertyId, range) => (await get('collections', { propertyId, ...range })).collections;
export const getOutstanding = async (propertyId) => (await get('outstanding', { propertyId })).outstanding;
export const getExpensesReport = async (propertyId, params) => (await get('expenses', { propertyId, ...params })).expenses;

// Downloads the server-generated CSV (nothing is computed in the browser).
export const downloadExport = async (type, propertyId, range) => {
  const res = await api.get('/reports/export', { params: clean({ type, propertyId, ...range }), responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? `stayos-${type}.csv`;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
