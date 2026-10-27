import { CookieOptions, Request, Response } from 'express';
import { env, isProd } from '../../config/env';
import * as authService from './auth.service';

export const REFRESH_COOKIE = 'refreshToken';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true, // JavaScript in the browser cannot read it (protects against XSS theft)
    secure: isProd, // HTTPS only in production
    sameSite: isProd ? 'none' : 'lax', // 'none' needed when frontend and API are on different domains
    path: '/api/v1/auth', // browser only sends it to auth routes
    maxAge: env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  };
}

const meta = (req: Request) => ({ userAgent: req.headers['user-agent'], ip: req.ip });

export async function register(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await authService.register(req.body, meta(req));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
  res.status(201).json({ success: true, data: { user, accessToken } });
}

export async function login(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await authService.login(req.body, meta(req));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
  res.status(200).json({ success: true, data: { user, accessToken } });
}

export async function refresh(req: Request, res: Response) {
  try {
    const { user, accessToken, refreshToken } = await authService.refresh(
      req.cookies?.[REFRESH_COOKIE],
      meta(req),
    );
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
    res.status(200).json({ success: true, data: { user, accessToken } });
  } catch (err) {
    // Clear a bad cookie so the browser stops sending it.
    const { maxAge: _maxAge, ...clearOpts } = cookieOptions();
    res.clearCookie(REFRESH_COOKIE, clearOpts);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  const { maxAge: _maxAge, ...clearOpts } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, clearOpts);
  res.status(204).send();
}

export async function me(req: Request, res: Response) {
  const { id, name, email, avatarUrl, createdAt } = req.user!;
  res.status(200).json({ success: true, data: { user: { id, name, email, avatarUrl, createdAt } } });
}
