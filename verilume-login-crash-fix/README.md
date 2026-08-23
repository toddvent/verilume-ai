# Login crash fix — 2026-08-23 (v2 — adds a deploy-verification marker)

## How to confirm this exact file is actually live

The previous copy of this fix was reportedly deployed, but the runtime
logs afterward still showed the *old* crash signature
(`Node.js process exited with exit status: 1` at `server.js:115:4`) —
which the new code specifically prevents. That means whatever was
deployed wasn't actually this file, regardless of what the deploy
dashboard showed. To make that unambiguous going forward, `backend/server.js`
now logs this line the instant it's loaded, before anything else runs:

    [server.js] BUILD MARKER: crash-fix-2026-08-23-v1 (INIT_PHASE guard present)

After deploying, make one request (even just loading the site) and check
Vercel Logs for that exact line.

- **If you see it:** this build is live. From there, a DB connectivity
  problem will show up as a clean single 500, not a process crash — and
  the `[pg-sync-worker] DATABASE_URL resolved to host="..."` line will
  tell us the real, current value of `DATABASE_URL`.
- **If you don't see it:** whatever's serving `verilume.ai` still isn't
  this file. That points at a deploy-pipeline issue independent of
  anything in this code — e.g. the deployment that got built doesn't
  match the file that was edited/uploaded, an old deployment is still the
  one promoted to Production, or the file replaced in your local copy
  wasn't the one actually included in the deploy. Worth checking the
  Deployments tab for exactly which deployment is currently live and when
  it was built relative to replacing this file.

## What this fixes (recap from v1)

`backend/server.js` runs ~230 database schema-setup calls (`db.exec(...)`,
`ensureColumn(...)`) at module load time — the moment the serverless
function cold-starts — completely unprotected, before any of the file's
own error handling exists yet. When the database was unreachable, the
first such call threw and killed the *entire* function process, not just
one request. `db` is now wrapped (`wrapDbForInit`) so a failure during
that one-time startup window is logged and skipped instead of crashing
the process; every real request-time query still throws and is caught
normally (a clean 500), exactly as before. Verified locally both with a
working DB and with a deliberately unreachable `DATABASE_URL` — module
load now succeeds either way.

## Deploy

Replace `backend/server.js` with the version in this folder (only file
changed) and deploy/redeploy as usual. No schema or env var changes
needed for this fix specifically.

## Still separately unresolved

`DATABASE_URL` was still resolving to Supabase's direct-connection host
(`db.<ref>.supabase.co:5432`) rather than the pooled Supavisor host
(`aws-0-<region>.pooler.supabase.com:6543`) as of the last check, despite
being deleted and recreated with a confirmed-correct pooled string. The
`[pg-sync-worker] DATABASE_URL resolved to host="..."` log line after this
deploy is the way to check what's actually live right now.
