/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  testTimeout: 20000,
  // Transpile only (fast). Type checking is done separately by `npm run typecheck`.
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
};
