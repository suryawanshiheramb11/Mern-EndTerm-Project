import mongoose from 'mongoose';
import { paiseField } from '../utils/money.js';

export const EXPENSE_CATEGORIES = ['electricity', 'water', 'internet', 'food', 'cleaning', 'repairs', 'salaries', 'maintenance', 'other'];
export const EXPENSE_PAYMENT_STATUSES = ['paid', 'pending', 'scheduled'];

const ref = (model, extra = {}) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, ...extra });

/*
 * Operating expense, cash-based: reports count an expense in the month of paidAt and only when
 * paymentStatus is 'paid'. Expenses are never hard-deleted; "delete" voids them (isVoided) and every
 * list/report excludes voided rows by default.
 */
const expenseSchema = new mongoose.Schema(
  {
    property: ref('Property', { required: true, index: true }),
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    amountPaise: { ...paiseField(), required: true, min: 1 },
    paidAt: { type: Date, required: true, index: true },
    periodKey: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ }, // derived from paidAt (IST month)
    description: { type: String, required: true, trim: true, minlength: 2, maxlength: 500 },
    vendor: { type: String, trim: true, maxlength: 120 },
    paymentStatus: { type: String, enum: EXPENSE_PAYMENT_STATUSES, default: 'paid' },
    receiptUrl: { type: String, trim: true, maxlength: 500 },
    notes: { type: String, trim: true, maxlength: 500 },
    createdBy: ref('User'),
    isVoided: { type: Boolean, default: false },
    voidedAt: { type: Date },
    voidedBy: ref('User'),
    voidReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

expenseSchema.index({ property: 1, paidAt: 1 });
expenseSchema.index({ property: 1, category: 1, paidAt: 1 });
expenseSchema.index({ property: 1, periodKey: 1 });

const forbidDelete = function forbidDelete(next) {
  next(new Error('Expenses cannot be deleted; void them instead'));
};
for (const hook of ['deleteOne', 'deleteMany', 'findOneAndDelete']) expenseSchema.pre(hook, forbidDelete);
expenseSchema.pre('deleteOne', { document: true, query: false }, forbidDelete);

export const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;
