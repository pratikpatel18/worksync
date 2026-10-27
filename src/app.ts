import cookieParser from 'cookie-parser';
import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { prisma } from './config/db';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { globalLimiter } from './middlewares/rateLimiter';
import authRoutes from './modules/auth/auth.routes';
import { asyncHandler } from './utils/asyncHandler';
import { logger } from './utils/logger';

// app.ts builds the Express app but does NOT listen on a port.
// That lets tests import it directly (server.ts is what actually starts listening).
export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // correct client IP behind a proxy/load balancer (needed for rate limiting)

// Middleware order matters: they run top to bottom on every request.
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
  }),
);
app.use('/api', globalLimiter);

// Health check that actually touches the database.
app.get(
  '/api/v1/health',
  asyncHandler(async (_req, res) => {
    let db: 'up' | 'down' = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', uptime: process.uptime(), db });
  }),
);

app.use('/api/v1/auth', authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
