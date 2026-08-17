'use strict';
// Runs inside a worker_thread. Owns the real Postgres connection pool and
// executes every query asynchronously, replying to the main thread over the
// MessagePort it's handed per-request. See pg-sync-bridge.js for why this
// exists and how the main thread blocks on the result.

const { parentPort } = require('worker_threads');
const { Pool } = require('pg');
const { translate } = require('./sql-translate');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — the pg-sync-worker cannot connect to Supabase without it.');
}

// Diagnostic only — logs the host/port Vercel actually injected at runtime,
// with the username and password redacted, so a stale/incorrect
// DATABASE_URL value shows up unambiguously in the Vercel logs instead of
// being inferred from a downstream ENOTFOUND error. Safe to leave in
// permanently; it never logs the password.
try {
  const u = new URL(connectionString);
  console.log(`[pg-sync-worker] DATABASE_URL resolved to host="${u.hostname}" port="${u.port}" db="${u.pathname}"`);
} catch (e) {
  console.error('[pg-sync-worker] DATABASE_URL is not a valid URL:', e.message);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

pool.on('error', (err) => {
  // A background idle-client error must not crash the worker thread.
  console.error('[pg-sync-worker] pool error:', err.message);
});

function toIdentityInsertReturning(sql, mode) {
  return sql; // no autoincrement PKs are relied on anywhere in this codebase
              // (grep confirmed zero uses of lastInsertRowid/.changes), so
              // no RETURNING rewrite is needed for run().
}

parentPort.on('message', async (msg) => {
  const { id, sql, params, mode, signal, port } = msg;
  let response;
  try {
    const pgSql = translate(sql);
    const result = await pool.query(pgSql, params || []);
    if (mode === 'get') {
      response = { ok: true, value: result.rows[0] || undefined };
    } else if (mode === 'all') {
      response = { ok: true, value: result.rows };
    } else if (mode === 'run' || mode === 'exec') {
      response = { ok: true, value: { changes: result.rowCount } };
    } else {
      response = { ok: false, error: `Unknown mode: ${mode}` };
    }
  } catch (err) {
    response = { ok: false, error: err.message, code: err.code };
  }
  try {
    port.postMessage(response);
  } finally {
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
    port.close();
  }
});
