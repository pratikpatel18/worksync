import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const skipInTests = () => env.NODE_ENV === 'test';

const limitResponse = {
  success: false,
  error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
};

// Applied to the whole API.
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: limitResponse,
});

// Much stricter, applied to login and register to slow down brute-force attacks.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: limitResponse,
});
