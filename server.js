const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');
const FILES = {
  reviews: path.join(RUNTIME_DIR, 'reviews.json'),
  contacts: path.join(RUNTIME_DIR, 'contacts.json'),
  analytics: path.join(RUNTIME_DIR, 'analytics.json'),
};
const seedReviews = [
  { id: 'seed-1', name: 'Portfolio visitor', rating: 5, message: 'Strong AI/robotics profile with real product depth.', createdAt: '2026-06-12T00:00:00.000Z' },
  { id: 'seed-2', name: 'Collaborator', rating: 5, message: 'Nathaniel moves fast across ML, cloud and product execution.', createdAt: '2026-06-12T00:00:00.000Z' },
  { id: 'seed-3', name: 'Reviewer', rating: 4, message: 'Clear project direction; would love to see even more case studies.', createdAt: '2026-06-12T00:00:00.000Z' },
];

const buckets = new Map();
const limits = {
  '/api/reviews': { windowMs: 15 * 60_000, max: 10 },
  '/api/contact': { windowMs: 15 * 60_000, max: 5 },
  '/api/analytics': { windowMs: 60_000, max: 90 },
};

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
}
function rateLimit(route) {
  return (req, res, next) => {
    const limit = limits[route] || { windowMs: 15 * 60_000, max: 60 };
    const key = `${route}:${clientIp(req)}`;
    const now = Date.now();
    const hit = buckets.get(key) || { count: 0, reset: now + limit.windowMs };
    if (now > hit.reset) {
      hit.count = 0;
      hit.reset = now + limit.windowMs;
    }
    hit.count += 1;
    buckets.set(key, hit);
    if (hit.count > limit.max) return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
    next();
  };
}
function clean(value, max = 500) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}
function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}
async function ensureData() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
  for (const file of Object.values(FILES)) {
    try { await fs.access(file); }
    catch { await fs.writeFile(file, '[]\n', 'utf8'); }
  }
}
async function readArray(file, fallback = []) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
async function writeArray(file, data) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
}
function id() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
}
function publicReview(review) {
  return {
    id: review.id,
    name: review.name,
    rating: review.rating,
    text: review.message || review.text || '',
    date: (review.createdAt || '').slice(0, 10),
    createdAt: review.createdAt,
  };
}

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '50kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'portfolio-backend', timestamp: new Date().toISOString() }));

app.get('/api/reviews', async (req, res) => {
  const saved = await readArray(FILES.reviews, []);
  const reviews = (saved.length ? saved : seedReviews).map(publicReview).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ ok: true, reviews });
});

app.post('/api/reviews', rateLimit('/api/reviews'), async (req, res) => {
  if (clean(req.body.website, 120)) return res.status(201).json({ ok: true });
  const name = clean(req.body.name, 80);
  const message = clean(req.body.message || req.body.text, 1000);
  const rating = Math.max(1, Math.min(5, Number(req.body.rating || 5)));
  const errors = {};
  if (name.length < 2) errors.name = 'Name is required.';
  if (message.length < 5) errors.message = 'Review must be at least 5 characters.';
  if (!Number.isInteger(rating)) errors.rating = 'Rating must be a number.';
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });
  const reviews = await readArray(FILES.reviews, []);
  const review = { id: id(), name, rating, message, createdAt: new Date().toISOString() };
  reviews.push(review);
  await writeArray(FILES.reviews, reviews.slice(-500));
  res.status(201).json({ ok: true, review: publicReview(review) });
});

app.post('/api/contact', rateLimit('/api/contact'), async (req, res) => {
  if (clean(req.body.website, 120)) return res.status(201).json({ ok: true, message: 'Message received.' });
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120);
  const subject = clean(req.body.subject || 'Portfolio inquiry', 120);
  const message = clean(req.body.message, 3000);
  const errors = {};
  if (name.length < 2) errors.name = 'Name is required.';
  if (!isEmail(email)) errors.email = 'Valid email is required.';
  if (message.length < 10) errors.message = 'Message must be at least 10 characters.';
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });
  const contacts = await readArray(FILES.contacts, []);
  contacts.push({ id: id(), name, email, subject, message, createdAt: new Date().toISOString() });
  await writeArray(FILES.contacts, contacts.slice(-500));
  res.status(201).json({ ok: true, message: 'Message received.' });
});

app.post('/api/analytics', rateLimit('/api/analytics'), async (req, res) => {
  const event = clean(req.body.event, 80);
  if (!event) return res.status(400).json({ ok: false, error: 'Event is required.' });
  let metadata = req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};
  const serialized = JSON.stringify(metadata);
  if (serialized.length > 2048) metadata = { truncated: true };
  const analytics = await readArray(FILES.analytics, []);
  analytics.push({ id: id(), event, path: clean(req.body.path || req.path, 300), metadata, createdAt: new Date().toISOString(), userAgent: clean(req.headers['user-agent'], 300) });
  await writeArray(FILES.analytics, analytics.slice(-2000));
  res.status(201).json({ ok: true });
});

app.use(express.static(ROOT, { extensions: ['html'] }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Not found.' });
  res.sendFile(path.join(ROOT, 'index.html'));
});

ensureData().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`Portfolio server listening on ${PORT}`));
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
