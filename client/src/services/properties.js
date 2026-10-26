import api from './api.js';

const data = (res) => res.data.data;
const LIST_ALL = { limit: 500 };

export const listProperties = async () => data(await api.get('/properties', { params: { limit: 100 } }));
export const getProperty = async (id) => data(await api.get(`/properties/${id}`)).property;
export const getOverview = async (id) => data(await api.get(`/properties/${id}/overview`)).overview;
export const createProperty = async (body) => data(await api.post('/properties', body)).property;

export const listRooms = async (propertyId) => data(await api.get(`/properties/${propertyId}/rooms`, { params: LIST_ALL }));
export const createRoom = async (propertyId, body) => data(await api.post(`/properties/${propertyId}/rooms`, body)).room;
export const updateRoom = async (propertyId, roomId, body) =>
  data(await api.patch(`/properties/${propertyId}/rooms/${roomId}`, body)).room;
export const deactivateRoom = async (propertyId, roomId) =>
  data(await api.delete(`/properties/${propertyId}/rooms/${roomId}`)).room;

export const listBeds = async (propertyId, filters = {}) => {
  const params = { ...LIST_ALL, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
  return data(await api.get(`/properties/${propertyId}/beds`, { params }));
};
export const createBeds = async (propertyId, roomId, body) =>
  data(await api.post(`/properties/${propertyId}/rooms/${roomId}/beds/bulk`, body)).items;
export const updateBed = async (propertyId, roomId, bedId, body) =>
  data(await api.patch(`/properties/${propertyId}/rooms/${roomId}/beds/${bedId}`, body)).bed;
export const deactivateBed = async (propertyId, roomId, bedId) =>
  data(await api.delete(`/properties/${propertyId}/rooms/${roomId}/beds/${bedId}`)).bed;
