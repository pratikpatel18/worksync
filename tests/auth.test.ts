import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/config/db';

const password = 'Str0ng@Pass';
const unique = () => `test_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;

const cookieOf = (res: request.Response): string => {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const found = raw?.find((c) => c.startsWith('refreshToken='));
  if (!found) throw new Error('no refresh cookie');
  return found.split(';')[0];
};

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: 'test_' } } });
  await prisma.$disconnect();
});

describe('health', () => {
  it('reports the database is up', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('up');
  });
});

describe('register', () => {
  it('creates a user, returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'Asha', email: unique(), password });
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/HttpOnly/i);
  });

  it('rejects a weak password', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'Asha', email: unique(), password: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate email (case-insensitive)', async () => {
    const email = unique();
    await request(app).post('/api/v1/auth/register').send({ name: 'Asha', email, password });
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Asha', email: email.toUpperCase(), password });
    expect(res.status).toBe(409);
  });
});

describe('login', () => {
  it('logs in with correct credentials', async () => {
    const email = unique();
    await request(app).post('/api/v1/auth/register').send({ name: 'Asha', email, password });
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('gives the same generic error for wrong password and unknown email', async () => {
    const email = unique();
    await request(app).post('/api/v1/auth/register').send({ name: 'Asha', email, password });
    const wrongPw = await request(app).post('/api/v1/auth/login').send({ email, password: 'Wrong@Pass1' });
    const noUser = await request(app).post('/api/v1/auth/login').send({ email: unique(), password });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.error.message).toBe(noUser.body.error.message);
  });
});

describe('protected route', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the user with a valid token', async () => {
    const email = unique();
    const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Asha', email, password });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
  });
});

describe('refresh rotation', () => {
  it('issues a new token and rejects reuse of the old one (revoking the family)', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Asha', email: unique(), password });
    const oldCookie = cookieOf(reg);

    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(first.status).toBe(200);
    const newCookie = cookieOf(first);
    expect(newCookie).not.toBe(oldCookie);

    // Reusing the old (now revoked) token is treated as theft.
    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(reuse.status).toBe(401);

    // The legitimate new token was in the same family, so it is revoked too.
    const afterReuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', newCookie);
    expect(afterReuse.status).toBe(401);
  });

  it('returns 401 without a cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('logout', () => {
  it('revokes the refresh token', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Asha', email: unique(), password });
    const cookie = cookieOf(reg);
    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });
});
