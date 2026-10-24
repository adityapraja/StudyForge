import { config } from './config.js';
import { pool, initDb, closeDb } from './db.js';

console.log('[DB-SETUP] Connecting to database...');
console.log(`[DB-SETUP] Target: ${config.databaseUrl.replace(/:[^:@]+@/, ':****@')}`);

try {
  await pool.query('SELECT 1');
  console.log('[DB-SETUP] Connection successful. Initializing schema and migrations...');
  await initDb();
  console.log('[DB-SETUP] Schema and migrations initialized successfully!');
} catch (error) {
  console.error('[DB-SETUP] Error initializing database:', error);
  process.exitCode = 1;
} finally {
  await closeDb();
}

