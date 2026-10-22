import { closeDb, initDb } from './db.js';

try {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('Set TEST_DATABASE_URL to tracker_test before applying schema or migrations.');
  }
  const target = new URL(testDatabaseUrl);
  if (
    target.hostname.toLowerCase() !== 'localhost'
    || (target.port || '5432') !== '5432'
    || target.pathname.replace(/^\/+/, '') !== 'tracker_test'
    || decodeURIComponent(target.username) !== 'postgres'
  ) {
    throw new Error('Migrations may only be run against localhost:5432/tracker_test as postgres.');
  }
  process.env.DATABASE_URL = testDatabaseUrl;
  await initDb();
  console.log('[DB] Schema and migrations applied successfully.');
} catch (error) {
  console.error('[DB] Schema or migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
