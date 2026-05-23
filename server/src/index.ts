import 'dotenv/config';
import './types';

import http from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { config } from './config';
import { logger } from './utils/logger';
import { pool } from './db/db';
import { generalLimiter, strictLimiter, webhookLimiter } from './middleware/rate-limit';
import { globalErrorHandler } from './middleware/error-handler';
import { wsService } from './services/websocket-service';
import { billingService } from './services/billing-service';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import readingRoutes from './routes/readings';
import paymentRoutes from './routes/payments';
import forumRoutes from './routes/forum';
import adminRoutes from './routes/admin';
import cronRoutes from './routes/cron';

const app = express();

// ─── Security headers (Helmet) ──────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: ["'self'", 'https://*.agora.io', 'wss://*.agora.io', 'https://*.stripe.com'],
        frameSrc: ["'self'", 'https://*.stripe.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false, // needed for Agora
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);

// ─── CORS ───────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: config.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

// ─── Logging ────────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/api/health' },
  }),
);

// ─── General rate limiter ───────────────────────────────────────────────────
app.use(generalLimiter);

// ─── Stripe webhook needs raw body for signature verification ───────────────
// Must be before express.json() — both paths supported for compat
app.use('/api/payments/webhook', webhookLimiter);
app.use('/api/webhooks/stripe', webhookLimiter);

// ─── JSON parsing for everything else ───────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Health checks ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/api/db-check', async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT 1 AS ok');
    res.json({ ok: result.rows[0]?.ok === 1 });
  } catch (err) {
    next(err);
  }
});

// ─── API routes ─────────────────────────────────────────────────────────────
// Auth routes with strict rate limiting
app.use('/api/auth', strictLimiter, authRoutes);

// User routes (readers are public, /me routes are authenticated)
app.use('/api', userRoutes);

// Reading routes
app.use('/api/readings', readingRoutes);

// Payment routes
app.use('/api/payments', paymentRoutes);

// Stripe webhook at build-guide path: POST /api/webhooks/stripe
// Mounts the same webhook handler at the canonical path from section 12.4
import webhookRoutes from './routes/webhooks';
app.use('/api/webhooks', webhookRoutes);

// Top-level GET /api/transactions per build guide section 12.4
import transactionRoutes from './routes/transactions';
app.use('/api', transactionRoutes);

// Forum routes
app.use('/api/forum', forumRoutes);

// Newsletter routes (public signup)
import newsletterRoutes from './routes/newsletter';
app.use('/api/newsletter', newsletterRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Cron routes
app.use('/api/cron', cronRoutes);

// ─── 404 fallback ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler (must be last) ────────────────────────────────────
app.use(globalErrorHandler);

// ─── HTTP server + WebSocket ────────────────────────────────────────────────
const server = http.createServer(app);
wsService.attach(server);

// Start billing service
billingService.start();

server.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv },
    `SoulSeer API server listening on port ${config.port}`,
  );
});

// ─── Graceful shutdown ──────────────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');
  billingService.shutdown();
  wsService.shutdown();
  server.close(async () => {
    logger.info('HTTP server closed');
    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database pool');
    }
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  shutdown('unhandledRejection');
});

export { app, server };
