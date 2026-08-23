# Database connection retry — 2026-08-23

## What this fixes

"Offline for a couple hours, first login attempt failed with a 500 / no logs, worked a minute later" — a cold-start connection to Supabase that failed once and never retried. Both Vercel (your serverless function) and Supabase (the database itself, which pauses after inactivity and takes a few seconds to resume) go cold when nothing's hit the site for a while. The first request after that gap had to wait through the wake-up delay, and instead of waiting it out, the code failed immediately and made you retry it yourself.

## What changed

Two files, both go to their existing nested path — overwrite in place:

- `backend/pg-sync-worker.js`
- `backend/pg-sync-bridge.js`

**`pg-sync-worker.js`** — a database query that fails with a connection-class error (connection refused, timed out, terminated, "too many clients", etc.) is now retried automatically up to 3 times with a short backoff (0.5s, then 2s) before giving up. A real SQL/data error (bad query, constraint violation, etc.) still fails immediately, exactly as before — only connection-type failures get retried, so this doesn't mask real bugs.

**`pg-sync-bridge.js`** — the internal wait timeout for a single database call went from 15s to 20s, so it stays comfortably longer than the worker's own worst-case retry time (~6s) and won't cut off a retry that's still in progress. Your `vercel.json` already allows 30s per function invocation, so this fits well within that budget.

## What this does NOT change

- No change to `DATABASE_URL`, Supabase settings, or the crash-guard fix from earlier today (`server.js`'s `INIT_PHASE` guard) — those stay as they are.
- If Supabase takes longer than ~6 seconds total to wake up, this will reduce how often you see the failure but won't eliminate it entirely for the very first request after a long idle period. If it's still happening after this, the next step would be looking at Supabase's own pause/compute settings (upgrading off a tier that auto-pauses is the permanent fix for that specific cause).

## Verification done

- Both files checked with `node --check` — no syntax errors.
- Re-read both files end to end to confirm the retry only triggers on connection-class errors, not on legitimate query failures.

## Deploy

Same process as before — github.dev, drag each file into its existing nested path (`backend/pg-sync-worker.js`, `backend/pg-sync-bridge.js`), confirm Source Control shows exactly these two as Modified, commit.
