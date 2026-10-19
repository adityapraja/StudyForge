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
    _pool = new Pool({
      connectionString: config.databaseUrl,
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
};

export const closeDb = async () => {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
};

