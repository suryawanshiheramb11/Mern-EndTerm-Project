import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'rent_due_soon', 'rent_overdue', 'payment_recorded', 'complaint_created', 'task_assigned',
  'complaint_resolved', 'checkin_upcoming', 'checkout_upcoming', 'refund_pending', 'announcement',
];

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 1000 },
    link: { type: String, maxlength: 200 }, // relative frontend route
    readAt: { type: Date },
    delivery: {
      inApp: { type: String, enum: ['sent'], default: 'sent' },
      email: { type: String, enum: ['sent', 'failed', 'skipped'], default: 'skipped' },
    },
    // `<event key>:<userId>`: one row per event per recipient, however often the event fires.
    dedupeKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ user: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
