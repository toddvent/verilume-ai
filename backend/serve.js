#!/usr/bin/env node
// backend/serve.js — long-lived production server for the CXMedia.AI /
// Verilume backend (2026-09-25).
//
// Why this file exists: per Todd's directive that the AI Brain "can never
// time out and needs to be as fast as possible," and the follow-on decision
// to move the API onto a warm, long-lived process (see the deploy runbook's
// 2026-09-25 entries). On Vercel, backend/server.js runs as a serverless
// function: every cold start re-loads this ~32,000-line module, re-runs its
// startup schema checks against Postgres, and opens a fresh worker thread +
// connection pool — and each instance then serves ONE request at a time
// while pg-sync-bridge blocks its event loop on every query. Here, the same
// handleRequest() runs unchanged inside a process that stays up: the module
// loads once, the pg pool (in pg-sync-worker.js) stays connected, the AI
// Brain's in-memory context cache (aiBrainCtxMem) stays warm, and a small
// cluster of workers serves requests in parallel so one slow, blocking
// request never queues everyone else behind it.
//
// Nothing in server.js changes. It already exports handleRequest for exactly
// this shape (see its module.exports comment); this file just owns the
// listening, the worker cluster, health, and graceful shutdown.
//
// Run:   node backend/serve.js
// Env:   PORT (default 8787), WEB_CONCURRENCY (worker count; default = CPU
//        count, capped at 4), DATABASE_URL (required in production),
//        plus every key server.js already reads (ANTHROPIC_API_KEY, ...).
'use strict';
const cluster = require('node:cluster');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 8787;
const IS_PROD = (process.env.NODE_ENV || '').toLowerCase() === 'production' || !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RENDER || !!process.env.FLY_APP_NAME;
const cpuCount = typeof os.availableParallelism === 'function' ? os.availableParallelism() : (os.cpus() || []).length || 1;
const WORKERS = Math.max(1, Math.min(Number(process.env.WEB_CONCURRENCY) || Math.min(cpuCount, 4), 16));

// Fail loud, not quiet: server.js only refuses to run without DATABASE_URL
// when it detects Vercel (RUNNING_ON_VERCEL). Off Vercel it would silently
// fall back to the bundled demo SQLite file — data that vanishes on the
// next deploy. Never let a production process start that way.
if (IS_PROD && !process.env.DATABASE_URL){
  console.error('[serve] FATAL: DATABASE_URL is not set. Refusing to start a production server against the local demo SQLite file. Set DATABASE_URL (Supabase Postgres connection string) in this service\'s environment and redeploy.');
  process.exit(1);
}

if (cluster.isPrimary){
  console.log(`[serve] primary ${process.pid}: starting ${WORKERS} worker${WORKERS === 1 ? '' : 's'} on port ${PORT} (cpus=${cpuCount}, prod=${IS_PROD})`);
  let shuttingDown = false;
  // Respawn with exponential backoff. server.js runs ~350 schema checks
  // against Postgres at module load, so if the database rejects us (wrong
  // password, paused project, network) every worker dies at require() time.
  // Re-forking every second then means hundreds of failed logins a minute —
  // enough to trip Supabase's pooler circuit breaker ("ECIRCUITBREAKER: too
  // many authentication failures") and lock out even a corrected password
  // (2026-09-26, seen during the Railway cut-over). Back off 2s → 4s → … →
  // 60s, and reset once a worker has stayed up for a minute.
  const bornAt = new Map();
  let backoffMs = 2000;
  const forkWorker = () => { const w = cluster.fork(); bornAt.set(w.id, Date.now()); return w; };
  for (let i = 0; i < WORKERS; i++) forkWorker();
  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) return;
    const lived = Date.now() - (bornAt.get(worker.id) || Date.now());
    bornAt.delete(worker.id);
    if (lived > 60000) backoffMs = 2000; else backoffMs = Math.min(backoffMs * 2, 60000);
    // A worker that dies (an out-of-memory kill, a native crash, a failed
    // startup) is replaced after the pause — the other workers keep serving
    // in the meantime, so a single bad request can't take the API down.
    console.error(`[serve] worker ${worker.process.pid} exited after ${Math.round(lived / 1000)}s (code=${code} signal=${signal}) — replacing in ${backoffMs / 1000}s`);
    setTimeout(() => { if (!shuttingDown) forkWorker(); }, backoffMs);
  });
  const shutdown = (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[serve] ${sig} received — asking workers to finish in-flight requests`);
    for (const id in cluster.workers){ try { cluster.workers[id].process.kill('SIGTERM'); } catch (e){ /* already gone */ } }
    // Hard stop well inside a typical platform grace window (Railway/Render
    // give ~30s) even if a worker is stuck in a long stream.
    setTimeout(() => { console.log('[serve] forcing exit'); process.exit(0); }, 25000).unref();
    let alive = Object.keys(cluster.workers).length;
    if (!alive) process.exit(0);
    cluster.on('exit', () => { alive--; if (alive <= 0) process.exit(0); });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
} else {
  const started = Date.now();
  const handleRequest = require(path.join(__dirname, 'server.js'));
  console.log(`[serve] worker ${process.pid}: server.js loaded in ${Date.now() - started}ms`);
  const server = http.createServer(handleRequest);
  // Streaming-friendly timeouts. requestTimeout 0 = never cut a response
  // that is still being written (the AI Brain's SSE replies can legitimately
  // run past 30s while the model writes). keepAliveTimeout above the usual
  // 60s load-balancer idle window so the proxy in front never reuses a
  // connection this server has just closed (the classic 502 source).
  server.requestTimeout = 0;
  server.headersTimeout = 65000;
  server.keepAliveTimeout = 66000;
  server.listen(PORT, () => console.log(`[serve] worker ${process.pid} listening on :${PORT}`));
  let closing = false;
  process.on('SIGTERM', () => {
    if (closing) return;
    closing = true;
    server.close(() => process.exit(0));
    // In-flight SSE streams keep the server open until they finish; cap it.
    setTimeout(() => process.exit(0), 20000).unref();
  });
}
