import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _pool = null;

export const getPool = () => {
  if (!_pool) {
    const isTest = process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL;
    const connectionString = isTest ? process.env.TEST_DATABASE_URL : config.databaseUrl;
    const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    const isRemote =
      connectionString.includes('sslmode=require') ||
      connectionString.includes('neon.tech') ||
      connectionString.includes('supabase.co') ||
      process.env.DATABASE_SSL === 'true' ||
      (config.isProduction && !isLocalhost);

    _pool = new Pool({
      connectionString,
      ssl: isRemote && !isLocalhost ? { rejectUnauthorized: false } : undefined,
    });
  }
  return _pool;
};

export const pool = new Proxy({}, {
  get(target, prop) {
    return getPool()[prop];
  },
});

export const query = (text, params) => getPool().query(text, params);

export const withTransaction = async (callback) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const initDb = async () => {
  const schemaPath = path.resolve(__dirname, '../schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await getPool().query(sql);

  const migrationsPath = path.resolve(__dirname, '../migrations');
  if (!fs.existsSync(migrationsPath)) return;

  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );

  const migrations = fs.readdirSync(migrationsPath)
    .filter((name) => /^\d+_[\w-]+\.sql$/.test(name))
    .sort();

  for (const name of migrations) {
    const { rows } = await query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [name]
    );
    if (rows.length > 0) continue;

    const migrationSql = fs.readFileSync(path.join(migrationsPath, name), 'utf8');
    await withTransaction(async (client) => {
      await client.query(migrationSql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    });
  }
};

export const closeDb = async () => {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
};
