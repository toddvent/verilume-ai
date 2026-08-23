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

// 2026-08-23 fix — "offline for a couple hours, first login attempt failed,
// worked a minute later" is the classic signature of BOTH Vercel and
// Supabase having gone fully cold: this serverless function cold-starts a
// brand-new worker thread and connection pool per invocation anyway, but on
// top of that, Supabase (especially on the free/low tiers) pauses a
// database after a period of no activity and takes several seconds to
// resume it on the next connection attempt. Previously that first query
// just failed outright (a clean, non-crashing error thanks to the
// try/catch below and the worker.on('error') fix in pg-sync-bridge.js —
// but still a failed login the user had to notice and retry themselves).
// Now a connection-class failure (as opposed to a real SQL/data error,
// which should surface immediately rather than being masked) is retried
// automatically, with backoff, before giving up — so a cold Supabase
// project wakes up transparently inside the one request instead of
// surfacing as a user-visible error. Total worst-case retry time (about
// 6s across all attempts) stays comfortably under WAIT_TIMEOUT_MS in
// pg-sync-bridge.js (raised to 20000ms alongside this change) so the
// bridge doesn't time out the call out from under a retry in progress.
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND',
]);
function isRetryableConnectionError(err) {
  if (RETRYABLE_ERROR_CODES.has(err.code)) return true;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('connection terminated') ||
         msg.includes('connection timeout') ||
         msg.includes('timeout expired') ||
         msg.includes('server is not accepting connections') ||
         msg.includes('too many clients');
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function queryWithRetry(pgSql, params, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [500, 2000]; // delay before attempt 2, then attempt 3
  try {
    return await pool.query(pgSql, params);
  } catch (err) {
    if (attempt >= MAX_ATTEMPTS || !isRetryableConnectionError(err)) throw err;
    console.error(`[pg-sync-worker] connection-class error on attempt ${attempt}/${MAX_ATTEMPTS}, retrying: ${err.message}`);
    await sleep(BACKOFF_MS[attempt - 1]);
    return queryWithRetry(pgSql, params, attempt + 1);
  }
}

parentPort.on('message', async (msg) => {
  const { id, sql, params, mode, signal, port } = msg;
  let response;
  try {
    const pgSql = translate(sql);
    const result = await queryWithRetry(pgSql, params || []);
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
