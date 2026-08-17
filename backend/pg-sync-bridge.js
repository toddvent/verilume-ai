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

const WAIT_TIMEOUT_MS = 15000;

function createSyncDb(connectionString) {
  const worker = new Worker(path.join(__dirname, 'pg-sync-worker.js'), {
    env: { ...process.env, DATABASE_URL: connectionString },
  });
  worker.unref(); // don't keep the process alive just for this worker

  let closed = false;

  function callWorker(sql, params, mode) {
    if (closed) throw new Error('pg-sync-bridge: database already closed');
    const { port1, port2 } = new MessageChannel();
    const signal = new Int32Array(new SharedArrayBuffer(4));
    worker.postMessage({ sql, params, mode, signal, port: port2 }, [port2]);

    const status = Atomics.wait(signal, 0, 0, WAIT_TIMEOUT_MS);
    if (status === 'timed-out') {
      port1.close();
      throw new Error(`pg-sync-bridge: query timed out after ${WAIT_TIMEOUT_MS}ms: ${sql.slice(0, 120)}`);
    }
    const msg = receiveMessageOnPort(port1);
    port1.close();
    if (!msg) {
      throw new Error('pg-sync-bridge: no response received from worker (it may have crashed)');
    }
    const response = msg.message;
    if (!response.ok) {
      const err = new Error(`Postgres query failed: ${response.error}\nSQL: ${sql}`);
      err.code = response.code;
      throw err;
    }
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
