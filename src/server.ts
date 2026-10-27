import http from 'http';
import { app } from './app';
import { prisma } from './config/db';
import { env } from './config/env';
import { logger } from './utils/logger';

const server = http.createServer(app); // Socket.io will attach to this server in Phase 5

server.listen(env.PORT, () => {
  logger.info(`WorkSync API running on http://localhost:${env.PORT}`);
});

// Graceful shutdown: stop accepting requests, then close the DB connection.
async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
