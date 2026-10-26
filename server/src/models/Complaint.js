import mongoose from 'mongoose';

export const COMPLAINT_CATEGORIES = ['plumbing', 'electrical', 'internet', 'cleaning', 'furniture', 'food', 'security', 'other'];
export const URGENCIES = ['low', 'medium', 'high'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const COMPLAINT_STATUSES = ['new', 'acknowledged', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened'];
export const OPEN_STATUSES = ['new', 'acknowledged', 'assigned', 'in_progress', 'reopened']; // not yet resolved

const ref = (model, extra = {}) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, ...extra });

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, maxlength: 500 },
    mime: { type: String, trim: true, maxlength: 100 },
    uploadedBy: ref('User'),
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Append-only. Response-time metrics are derived from these timestamps, never from updatedAt.
const historySchema = new mongoose.Schema({
  status: { type: String, enum: COMPLAINT_STATUSES, required: true },
  fromStatus: { type: String, enum: COMPLAINT_STATUSES, default: null },
  by: ref('User'),
  at: { type: Date, default: Date.now },
  assignedTo: ref('User'),
  note: { type: String, trim: true, maxlength: 2000 },
  progressNote: { type: String, trim: true, maxlength: 1000 },
  completionPhotoUrl: { type: String, maxlength: 500 },
});

const complaintSchema = new mongoose.Schema(
  {
    property: ref('Property', { required: true, index: true }),
    resident: ref('Resident', { required: true, index: true }),
    stay: ref('Stay', { required: true, index: true }),
    room: ref('Room'),
    bed: ref('Bed'),
    complaintNumber: { type: String, required: true, unique: true },
    category: { type: String, enum: COMPLAINT_CATEGORIES, required: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, required: true, trim: true, minlength: 3, maxlength: 2000 },
    urgency: { type: String, enum: URGENCIES, required: true },
    priority: { type: String, enum: PRIORITIES }, // set by staff when assigning
    attachments: { type: [attachmentSchema], default: [] },
    status: { type: String, enum: COMPLAINT_STATUSES, default: 'new', index: true },
    assignedTo: ref('User'),
    statusHistory: { type: [historySchema], default: [] },
    resolutionNotes: { type: String, trim: true, maxlength: 2000 },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
    reopenedAt: { type: Date },
    reopenedCount: { type: Number, default: 0, min: 0 },
    slaDueAt: { type: Date },
  },
  { timestamps: true },
);

complaintSchema.index({ property: 1, status: 1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
complaintSchema.index({ slaDueAt: 1, status: 1 });

// Complaints and their history are never deleted.
const forbidDelete = function forbidDelete(next) {
  next(new Error('Complaints cannot be deleted'));
};
for (const hook of ['deleteOne', 'deleteMany', 'findOneAndDelete']) complaintSchema.pre(hook, forbidDelete);
complaintSchema.pre('deleteOne', { document: true, query: false }, forbidDelete);

export const Complaint = mongoose.model('Complaint', complaintSchema);
export default Complaint;
