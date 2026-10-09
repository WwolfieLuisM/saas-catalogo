import { getPrisma } from '../config/database.js';
import { logger } from './logger.js';

export async function checkDatabaseHealth(): Promise<'ok' | 'error'> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return 'ok';
  } catch (error) {
    logger.warn({ err: error }, 'database health check failed');
    return 'error';
  }
}
