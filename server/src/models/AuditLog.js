import mongoose from 'mongoose';

// Append-only record of sensitive actions. Never updated or deleted.
const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    meta: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
    at: { type: Date, default: Date.now },
  },
  { collection: 'auditLogs', versionKey: false },
);

auditLogSchema.index({ entityType: 1, entityId: 1, at: 1 });
auditLogSchema.index({ property: 1, at: -1 });

const forbid = function forbid(next) {
  next(new Error('Audit log entries are immutable'));
};
for (const hook of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  auditLogSchema.pre(hook, forbid);
}
auditLogSchema.pre('deleteOne', { document: true, query: false }, forbid);

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
