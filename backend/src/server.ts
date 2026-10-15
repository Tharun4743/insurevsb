/**
 * INSURE – Smarter Driving. Fairer Insurance.
 * Backend API Server
 *
 * Entry point: configures Express, middleware, routes, and starts the server.
 */

import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { errorHandler } from './middleware/errorHandler';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import complianceRoutes from './routes/compliance';
import consentRoutes from './routes/consent';
import simulatorRoutes from './routes/simulator';
import tripsRoutes from './routes/trips';
import assessmentsRoutes from './routes/assessments';
import quotesRoutes from './routes/quotes';
import reviewRoutes from './routes/review';
import auditRoutes from './routes/audit';
import accidentRoutes from './routes/accidents';
import profitabilityRoutes from './routes/profitability';

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
const rawOrigins = [
  process.env.CORS_ORIGINS,
  process.env.FRONTEND_URL,
  process.env.FRONTEND_ORIGIN,
  process.env.CLIENT_URL,
]
  .filter((x): x is string => Boolean(x))
  .flatMap(str => str.split(','))
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];
const allowedOrigins = rawOrigins.length > 0 ? rawOrigins : defaultOrigins;

app.use(cors({
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return cb(null, true);

    const normalized = origin.replace(/\/+$/, '');

    if (allowedOrigins.includes('*')) {
      return cb(null, true);
    }

    if (allowedOrigins.includes(normalized)) {
      return cb(null, true);
    }

    if (/^https:\/\/.*\.vercel\.app$/.test(normalized) || /^https:\/\/.*\.onrender\.com$/.test(normalized)) {
      return cb(null, true);
    }

    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// ── Body parsing & compression ────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(compression());

// ── Request logging (dev vs production) ───────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(logFormat));
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' } as any,
});
app.use(limiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/health',            healthRoutes);
app.use('/api/health',        healthRoutes);
app.use('/api/auth',          authRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/compliance',    complianceRoutes);
app.use('/api/consent',       consentRoutes);
app.use('/api/simulator',     simulatorRoutes);
app.use('/api/trips',         tripsRoutes);
app.use('/api/assessments',   assessmentsRoutes);
app.use('/api/quotes',        quotesRoutes);
app.use('/api/review',        reviewRoutes);
app.use('/api/audit',         auditRoutes);
app.use('/api/accidents',     accidentRoutes);
app.use('/api/profitability', profitabilityRoutes);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// ── Centralised error handler ─────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`[INSURE] Backend listening on http://${HOST}:${PORT}`);
    console.log(`[INSURE] NODE_ENV=${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
export = app;
