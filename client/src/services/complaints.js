import api from './api.js';

const data = (res) => res.data.data;
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v));

export const listComplaints = async (filters = {}) => data(await api.get('/complaints', { params: { limit: 100, ...clean(filters) } }));
export const getComplaint = async (id) => data(await api.get(`/complaints/${id}`)).complaint;
export const createComplaint = async (body) => data(await api.post('/complaints', body)).complaint;
export const listAssignees = async (propertyId) => data(await api.get('/complaints/assignees', { params: { propertyId } })).items;

// One PATCH per transition; the server decides which are allowed (see complaint.actions).
export const transition = async (id, action, body = {}) => data(await api.patch(`/complaints/${id}/${action}`, body)).complaint;
// Students reopen through POST; staff through PATCH (the server enforces who may use which).
export const reopenAsStudent = async (id, body) => data(await api.post(`/complaints/${id}/reopen`, body)).complaint;
