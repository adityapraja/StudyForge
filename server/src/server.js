import { config } from './config.js';
import { createApp } from './app.js';
import { pool, initDb, closeDb } from './db.js';

const app = createApp();

const start = async () => {
  try {
    // Check database connection
    await pool.query('SELECT 1');
    console.log('[DB] Connected to PostgreSQL successfully.');

    // Auto-initialize schema in development or when explicitly enabled
    if (config.nodeEnv === 'development' || process.env.AUTO_INIT_DB === 'true') {
      try {
        await initDb();
        console.log('[DB] Schema verified/initialized.');
      } catch (err) {
        console.warn('[DB] Schema init warning:', err.message);
      }
    }

    const server = app.listen(config.port, () => {
      console.log(`[Server] StudyForge backend listening on port ${config.port} (${config.nodeEnv})`);
    });

    const shutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal}. Gracefully shutting down...`);
      server.close(async () => {
        await closeDb();
        console.log('[Server] Shutdown complete.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[Server] Fatal startup error:', error);
    process.exit(1);
  }
};

start();

