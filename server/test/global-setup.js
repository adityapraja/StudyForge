import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

let pgProcess = null;

dotenv.config({ path: path.resolve(import.meta.dirname, '../.env') });

const findPgBinary = (name) => {
  const candidates = [
    name,
    `/usr/pgsql-18/bin/${name}`,
    `/usr/pgsql-17/bin/${name}`,
    `/usr/pgsql-16/bin/${name}`,
    `/usr/lib/postgresql/16/bin/${name}`,
    `/usr/lib/postgresql/15/bin/${name}`,
    `/usr/lib/postgresql/14/bin/${name}`,
  ];
  for (const c of candidates) {
    try {
      execSync(`which ${c}`, { stdio: 'ignore' });
      return c;
    } catch (e) {}
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return name;
};

const cleanLocks = (pgData, socketDir) => {
  try {
    fs.unlinkSync(path.join(pgData, 'postmaster.pid'));
  } catch (e) {}
  try {
    fs.unlinkSync(path.join(socketDir, '.s.PGSQL.5433.lock'));
  } catch (e) {}
  try {
    fs.unlinkSync(path.join(socketDir, '.s.PGSQL.5433'));
  } catch (e) {}
};

export async function setup() {
  // Prefer a dedicated local test URL; CI supplies DATABASE_URL for its test service.
  const existingUrl = process.env.TEST_DATABASE_URL
    || (process.env.CI ? process.env.DATABASE_URL : null);
  if (existingUrl) {
    let target;
    try {
      target = new URL(existingUrl);
    } catch {
      throw new Error('The configured test database URL is invalid.');
    }
    if (
      target.hostname.toLowerCase() !== 'localhost'
      || (target.port || '5432') !== '5432'
      || target.pathname.replace(/^\/+/, '') !== 'tracker_test'
      || decodeURIComponent(target.username) !== 'postgres'
    ) {
      throw new Error('Automated tests may only use localhost:5432/tracker_test as postgres.');
    }

    process.env.DATABASE_URL = existingUrl;
    process.env.TEST_DATABASE_URL = existingUrl;
    process.env.NODE_ENV = 'test';
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const client = new pg.Client({ connectionString: existingUrl });
        await client.connect();
        await client.query('SELECT 1');
        await client.end();
        ready = true;
        break;
      } catch (err) {
        await new Promise((res) => setTimeout(res, 500));
      }
    }

    if (ready) {
      const { initDb, closeDb } = await import('../src/db.js');
      try {
        await initDb();
      } finally {
        await closeDb();
      }
      return;
    }
    throw new Error('Could not connect to the configured test database. Check TEST_DATABASE_URL.');
  }

  if (process.platform === 'win32') {
    throw new Error(
      'Set TEST_DATABASE_URL to a dedicated PostgreSQL test database before running tests on Windows.'
    );
  }

  // Linux development fallback for a locally managed test cluster.
  const pgData = '/tmp/test_pgdata';
  const socketDir = '/tmp/pgsockets';
  fs.mkdirSync(socketDir, { recursive: true });

  const connUrl = `postgres://postgres@localhost:5433/tracker_test?host=${socketDir}`;
  process.env.DATABASE_URL = connUrl;
  process.env.TEST_DATABASE_URL = connUrl;
  process.env.NODE_ENV = 'test';

  // Check if test cluster is already active
  let alreadyRunning = false;
  try {
    const testClient = new pg.Client({ connectionString: connUrl });
    await testClient.connect();
    await testClient.end();
    alreadyRunning = true;
  } catch (e) {}

  if (!alreadyRunning) {
    const initdbBin = findPgBinary('initdb');
    const postgresBin = findPgBinary('postgres');

    if (!fs.existsSync(pgData)) {
      execSync(`${initdbBin} -D ${pgData} -U postgres -A trust`, { stdio: 'ignore' });
    }

    cleanLocks(pgData, socketDir);

    pgProcess = spawn(
      postgresBin,
      ['-D', pgData, '-p', '5433', '-k', socketDir],
      { stdio: 'ignore' }
    );

    // Poll until ready
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const client = new pg.Client({ connectionString: connUrl });
        await client.connect();
        await client.query('SELECT 1');
        await client.end();
        ready = true;
        break;
      } catch (e) {
        try {
          const rootClient = new pg.Client({
            connectionString: `postgres://postgres@localhost:5433/postgres?host=${socketDir}`,
          });
          await rootClient.connect();
          await rootClient.query('CREATE DATABASE tracker_test;');
          await rootClient.end();
          ready = true;
          break;
        } catch (err) {}
        await new Promise((res) => setTimeout(res, 100));
      }
    }

    if (!ready) {
      throw new Error('Could not start test postgres server');
    }
  }

  // Ensure schema is up to date
  const { initDb, closeDb } = await import('../src/db.js');
  try {
    await initDb();
  } finally {
    await closeDb();
  }
}

export async function teardown() {
  if (pgProcess) {
    try {
      pgProcess.kill('SIGINT');
    } catch (e) {}
    pgProcess = null;
  }
}
