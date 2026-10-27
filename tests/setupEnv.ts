// Runs before every test file. Sets env vars so config/env.ts validation passes.
// Tests use the same local Postgres as development unless TEST_DATABASE_URL is set.
process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test_secret_that_is_at_least_32_characters_long';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://worksync:worksync_dev_password@localhost:5432/worksync?schema=public';
