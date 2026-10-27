import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/tokens';

// Verifies the Bearer access token and attaches the user to req.user.
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized('Missing access token');

    let userId: string;
    try {
      userId = verifyAccessToken(header.slice(7)).sub;
    } catch {
      throw ApiError.unauthorized('Invalid or expired access token');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatarUrl: true, isActive: true, createdAt: true },
    });
    if (!user || !user.isActive) throw ApiError.unauthorized('User no longer exists');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
