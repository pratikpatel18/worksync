import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/tokens';
import { LoginInput, RegisterInput } from './auth.schema';

const BCRYPT_COST = 12;

// A real bcrypt hash of a random string. Compared against when the email is unknown,
// so login takes the same time whether or not the account exists (prevents user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

const publicUser = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  createdAt: true,
} as const;

function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
}

async function issueRefreshToken(userId: string, familyId: string, meta: RequestMeta) {
  const token = generateRefreshToken();
  const record = await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: refreshExpiry(),
      userAgent: meta.userAgent,
      ipAddress: meta.ip,
    },
  });
  return { token, id: record.id };
}

export async function register(input: RegisterInput, meta: RequestMeta) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash },
    select: publicUser,
  });

  const refresh = await issueRefreshToken(user.id, crypto.randomUUID(), meta);
  return { user, accessToken: signAccessToken(user.id), refreshToken: refresh.token };
}

export async function login(input: LoginInput, meta: RequestMeta) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always run bcrypt.compare, and always return the same generic error.
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.isActive || !valid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const refresh = await issueRefreshToken(user.id, crypto.randomUUID(), meta);
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    },
    accessToken: signAccessToken(user.id),
    refreshToken: refresh.token,
  };
}

// Rotation: every refresh revokes the presented token and issues a new one in the same "family".
// Reuse detection: if an already-revoked token is presented, someone may have stolen it,
// so the whole family is revoked and the user must log in again.
export async function refresh(presentedToken: string | undefined, meta: RequestMeta) {
  if (!presentedToken) throw ApiError.unauthorized('Missing refresh token');

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(presentedToken) },
    include: { user: { select: { id: true, isActive: true } } },
  });
  if (!stored) throw ApiError.unauthorized('Invalid refresh token');

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw ApiError.unauthorized('Refresh token reuse detected');
  }

  if (stored.expiresAt < new Date() || !stored.user.isActive) {
    throw ApiError.unauthorized('Refresh token expired');
  }

  const next = await issueRefreshToken(stored.userId, stored.familyId, meta);
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date(), replacedBy: next.id },
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: stored.userId },
    select: publicUser,
  });

  return { user, accessToken: signAccessToken(stored.userId), refreshToken: next.token };
}

export async function logout(presentedToken: string | undefined) {
  if (!presentedToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
