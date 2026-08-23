# Login crash fix — 2026-08-23

## What this fixes

The `INTERNAL_FUNCTION_INVOCATION_FAILED` / "Node.js process exited with exit
status: 1" crashes were NOT happening inside a request. They were happening
at module load — the moment Vercel cold-starts the serverless function.

`backend/server.js` has ~230 `db.exec(...)` / `ensureColumn(...)` schema-setup
calls that run immediately when the file is `require()`'d, before
`handleRequest`'s try/catch exists and before the
`process.on('uncaughtException')` safety net (further down the same file) is
even registered. When the database is unreachable for any reason (a bad
`DATABASE_URL`, a transient DNS blip, Supabase briefly unavailable, etc.), the
very first one of those calls throws synchronously with nothing left to catch
it — Node kills the whole process. That takes down every concurrent request
on that cold start, not just the one that hit the bad connection.

## The fix

`backend/server.js` only. The `db` object returned by `createSyncDb(...)`
(Postgres) or `new DatabaseSync(...)` (local SQLite) is now wrapped by
`wrapDbForInit(...)`. While the module is still loading (`INIT_PHASE = true`),
an `exec()` failure is logged and swallowed instead of crashing the process.
`INIT_PHASE` flips to `false` right before `module.exports = handleRequest`,
so from that point on — i.e. for every real request — a query failure throws
normally again and is caught exactly as before, either by `handleRequest`'s
own try/catch (a clean 500 with a real error message) or, for anything async,
by the existing process-level `uncaughtException`/`unhandledRejection`
handlers.

Net effect: a database connectivity problem now produces clean, contained
500s on the requests that actually need the DB, instead of taking the entire
function down on every cold start. This is a resilience fix, independent of
whatever is causing `DATABASE_URL` to be unreachable — it doesn't fix a bad
connection string, it just stops a bad connection string from being
catastrophic.

Verified locally: module loads and exports `handleRequest` successfully both
with a working local DB and with a deliberately unreachable `DATABASE_URL`
(previously crashed the whole process either way; now only individual
DB-dependent requests fail).

## Deploy

Replace `backend/server.js` with the version in this folder. No other files
changed, no schema changes, no env var changes needed for this fix
specifically.

## Still separately in progress

This does not fix why `DATABASE_URL` itself has been resolving to Supabase's
direct-connection host (`db.<ref>.supabase.co:5432`) instead of the pooled
Supavisor host (`aws-0-<region>.pooler.supabase.com:6543`) despite several
edits. If a fresh, confirmed-correct `DATABASE_URL` has just been set, the
`[pg-sync-worker] DATABASE_URL resolved to host="..."` log line on the next
login attempt is the definitive way to confirm which one the running
function actually has.
