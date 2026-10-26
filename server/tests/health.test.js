import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import app from '../src/app.js';
import { ApiError } from '../src/utils/ApiError.js';
import { notFound } from '../src/middleware/notFound.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

describe('GET /api/health', () => {
  it('responds 200 with the standard envelope', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.uptime).toBe('number');
    expect(res.body.data.timestamp).toBeTruthy();
  });

  it('returns a 404 envelope for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('errorHandler', () => {
  it('renders a thrown ApiError in the standard shape', async () => {
    const a = express();
    a.get('/boom', () => {
      throw new ApiError(422, 'Nope', [{ field: 'x', message: 'bad' }]);
    });
    a.use(notFound);
    a.use(errorHandler);

    const res = await request(a).get('/boom');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ success: false, message: 'Nope', errors: [{ field: 'x', message: 'bad' }] });
  });
});
