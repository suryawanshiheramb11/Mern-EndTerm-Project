import api from './api.js';

const data = (res) => res.data.data;

export const listStaff = async (propertyId) => data(await api.get(`/properties/${propertyId}/staff`)).items;
export const inviteStaff = async (propertyId, body) => data(await api.post(`/properties/${propertyId}/staff/invite`, body));
export const updateStaff = async (propertyId, userId, body) => data(await api.patch(`/properties/${propertyId}/staff/${userId}`, body)).user;
export const revokeStaff = async (propertyId, userId) => data(await api.delete(`/properties/${propertyId}/staff/${userId}`));
export const sendAnnouncement = async (propertyId, body) => data(await api.post(`/properties/${propertyId}/announcements`, body));
