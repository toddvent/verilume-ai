'use strict';
// Drop-in replacement for node:sqlite's DatabaseSync, backed by a real
// Postgres (Supabase) connection instead of a local file.
//
// WHY THIS EXISTS: server.js has ~400 call sites written as synchronous
// `db.prepare(sql).get/all/run(...)` calls, scattered through ~200 helper
// functions at every depth of the call graph. A fully "native" migration to
// an async Postgres driver would require converting every one of those
// functions to async and adding `await` at every call site up the chain —
// a large, high-risk rewrite of the entire file.
//
// Instead, this module keeps the exact same synchronous call shape server.js
// already uses. It runs the real (async) Postgres query on a background
// worker thread, and blocks the calling thread with Atomics.wait() until the
// worker signals completion — then reads the result back via
// receiveMessageOnPort(), which is Node's supported synchronous counterpart
// to postMessage(). This is the same pattern used by tools like `synckit`
// for bridging sync APIs onto async work.
//
// TRADE-OFF, stated plainly: this adds a small amount of latency per query
// (a thread hop) compared to a "pure" native-async rewrite, and it only
// works in Node's standard Node.js runtime (not Vercel's Edge runtime,
// which doesn't support worker_threads). Vercel's default Node.js
// Serverless Functions are unaffected — this is exactly the environment
// this bridge is designed for.

const { Worker, receiveMessageOnPort, MessageChannel } = require('worker_threads');
const path = require('path');

// 2026-08-23 fix — raised from 15000 to 20000 alongside pg-sync-worker.js's
// new connection retry logic (up to ~6s of internal backoff across 3
// attempts when Supabase is waking from a cold pause). This must stay
// comfortably above the worker's own worst-case retry time, or the bridge
// would time out a call that was still legitimately retrying.
const WAIT_TIMEOUT_MS = 20000;

function createSyncDb(connectionString) {
  const worker = new Worker(path.join(__dirname, 'pg-sync-worker.js'), {
    env: { ...process.env, DATABASE_URL: connectionString },
  });
  worker.unref(); // don't keep the process alive just for this worker

  let closed = false;

  // 2026-08-20 fix — this Worker had no 'error' listener. Node's rule for
  // any EventEmitter (Worker included) is: an 'error' event with zero
  // listeners is rethrown as an uncaught exception, which crashes the whole
  // Node process — not just the request that triggered it. That's exactly
  // what Vercel's logs showed as intermittent "500
  // INTERNAL_FUNCTION_INVOCATION_FAILED" on POST /api/accounts: a transient
  // worker-thread failure (most likely the first Supabase pooler connection
  // on a cold start) was taking down the entire serverless function
  // invocation instead of surfacing as a normal, catchable error that
  // handleRequest()'s existing try/catch in server.js turns into a clean
  // JSON 500. Recording the error here (rather than leaving the listener
  // absent) is what stops the crash — the error is now just data.
  let workerFailure = null;
  worker.on('error', (err) => {
    console.error('[pg-sync-bridge] worker thread error:', err);
    workerFailure = err;
  });
  worker.on('exit', (code) => {
    if (code !== 0 && !closed) {
      console.error(`[pg-sync-bridge] worker thread exited unexpectedly with code ${code}`);
      if (!workerFailure) {
        workerFailure = new Error(`pg-sync-bridge: worker thread exited unexpectedly with code ${code}`);
      }
    }
  });

  // 2026-08-26 diagnostic addition, per direct report — repeated real
  // process crashes (Vercel: INTERNAL_FUNCTION_INVOCATION_FAILED) on
  // requests that all pass through this bridge, but every crash so far has
  // shown ZERO logs for the request (not even the module's own top-level
  // BUILD MARKER line), so there's been no way to tell whether the crash
  // happens before postMessage, while blocked in Atomics.wait, or after.
  // Disabling Vercel's Fluid Compute (ruling out the concurrent-thread-
  // collision theory this was originally built to test) did NOT stop the
  // crash, so this is now pure instrumentation to find where it actually
  // dies, not a fix. Every call gets a short id so overlapping calls (if
  // any) are distinguishable in the logs. If a crash still shows none of
  // these lines, that's real evidence too — it would mean the process dies
  // somewhere between the request arriving and callWorker() ever running.
  let callWorkerSeq = 0;
  function callWorker(sql, params, mode) {
    const callId = `pgw${++callWorkerSeq}-${Date.now().toString(36)}`;
    if (closed) throw new Error('pg-sync-bridge: database already closed');
    // A worker that already died (see the 'error'/'exit' listeners above)
    // would otherwise hang every subsequent call for the full
    // WAIT_TIMEOUT_MS before timing out — fail fast instead with the real
    // reason, so one bad connection doesn't turn into a string of slow
    // 500s on the same warm container.
    if (workerFailure) {
      console.error(`[pg-sync-bridge] ${callId} worker already dead before this call started (mode=${mode})`);
      throw new Error(`pg-sync-bridge: worker thread is dead (${workerFailure.message}) — this container needs a fresh invocation`);
    }
    const { port1, port2 } = new MessageChannel();
    const signal = new Int32Array(new SharedArrayBuffer(4));
    console.error(`[pg-sync-bridge] ${callId} posting to worker (mode=${mode}): ${sql.slice(0, 100)}`);
    worker.postMessage({ sql, params, mode, signal, port: port2 }, [port2]);

    console.error(`[pg-sync-bridge] ${callId} entering Atomics.wait (timeout ${WAIT_TIMEOUT_MS}ms)`);
    const status = Atomics.wait(signal, 0, 0, WAIT_TIMEOUT_MS);
    console.error(`[pg-sync-bridge] ${callId} Atomics.wait returned: ${status}`);
    if (status === 'timed-out') {
      port1.close();
      throw new Error(`pg-sync-bridge: query timed out after ${WAIT_TIMEOUT_MS}ms: ${sql.slice(0, 120)}`);
    }
    const msg = receiveMessageOnPort(port1);
    port1.close();
    if (!msg) {
      console.error(`[pg-sync-bridge] ${callId} no message received from worker after wait resolved`);
      throw new Error('pg-sync-bridge: no response received from worker (it may have crashed)');
    }
    const response = msg.message;
    if (!response.ok) {
      console.error(`[pg-sync-bridge] ${callId} worker replied with an error: ${response.error}`);
      const err = new Error(`Postgres query failed: ${response.error}\nSQL: ${sql}`);
      err.code = response.code;
      throw err;
    }
    console.error(`[pg-sync-bridge] ${callId} completed ok`);
    return response.value;
  }

  return {
    exec(sql) {
      callWorker(sql, [], 'exec');
    },
    prepare(sql) {
      return {
        get(...params) { return callWorker(sql, params, 'get'); },
        all(...params) { return callWorker(sql, params, 'all'); },
        run(...params) { return callWorker(sql, params, 'run'); },
      };
    },
    close() {
      closed = true;
      worker.terminate();
    },
  };
}

module.exports = { createSyncDb };
