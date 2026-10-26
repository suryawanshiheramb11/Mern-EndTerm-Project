import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { serializeExpense } from '../utils/serializers.js';
import * as expenses from '../services/expense.service.js';

export const create = asyncHandler(async (req, res) => {
  ApiResponse.created(res, { expense: serializeExpense(await expenses.createExpense(req.user, req.body)) }, 'Expense recorded');
});
export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await expenses.listExpenses(req.user, req.query);
  ApiResponse.send(res, { items: items.map(serializeExpense), pagination });
});
export const get = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { expense: serializeExpense(await expenses.getExpense(req.user, req.params.id)) });
});
export const update = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { expense: serializeExpense(await expenses.updateExpense(req.user, req.params.id, req.body)) }, 'Expense updated');
});
export const remove = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { expense: serializeExpense(await expenses.voidExpense(req.user, req.params.id, req.body)) }, 'Expense voided');
});
