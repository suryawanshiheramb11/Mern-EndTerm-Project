// Vercel serverless entry: the same Express app as `npm start`, with the MongoDB connection and
// index build cached across warm invocations (a cold start pays for them once).
import app from '../server/src/app.js';
import { connectOnce } from '../server/src/config/db.js';

export default async function handler(req, res) {
  try {
    await connectOnce();
  } catch (err) {
    console.error('Database unavailable', err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Service temporarily unavailable' }));
    return;
  }
  return app(req, res);
}
