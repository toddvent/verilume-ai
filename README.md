# Verilume — consolidated deploy package (2026-08-24)

This is everything, in one place. Your last deploy is stuck on the round-15
build stamp (`2026-08-23-top5-urgent-module`), so this package assumes
nothing about what's currently live and includes every file that's been
touched across this whole engagement, not just this session.

## What's inside

- `frontend/portal.html` — the complete current portal, including:
  - Round 16: Brand / Marketer / Data Scientist real designed shells
  - Round 16: mobile pass + Account Management exec-chart visibility fix
  - Round 16: Ask Verilume persistent voice bar (UI shell only)
  - Round 16: Pending Development badge wording + AI Agent Thoughts drawer recategorized
  - Curated News activated for the CMO role (5 real, verified headlines)
- `backend/server.js` — includes all cold-start / wake-up fixes to date:
  - `queryWithRetry()` connection retry on transient Postgres errors
  - `INIT_PHASE` crash guard (a DB hiccup during schema setup no longer kills the whole process)
  - `fixLegacyColumnCasing()` moved off the module-load path (was itself a 30s-timeout cause, now an on-demand admin endpoint)
  - **New today:** `ensureColumn()` bulk information_schema pre-check — this was the last undiagnosed piece of the wake-up slowness (~184 blocking round trips on every cold start, now down to 1 in steady state)
- `backend/pg-sync-bridge.js` / `backend/pg-sync-worker.js` — the Postgres sync bridge with the connection-retry logic and worker error/exit handlers (2026-08-20 and 2026-08-23 fixes)
- `vercel.json` — function config (`maxDuration: 30`, etc.) — included for completeness; only touch if your live version has drifted
- `middleware.js` — the site's Basic Auth password gate — included for completeness; only touch if your live version has drifted

## Deploy steps

1. Replace each file at its matching path in your GitHub repo.
2. Push / commit — Vercel should auto-deploy from the push.
3. Hard-refresh the live site (Cmd/Ctrl+Shift+R) and check the browser console for:
   `[CXMedia.AI] portal.html build: 2026-08-24-curated-news-activated-cmo-role`
   That confirms the frontend landed.
4. For the backend fix, the real test is the next cold start (first login after the
   site has sat idle a while) — it should resolve noticeably faster than 30 seconds.
   There's no console stamp for the backend the way there is for the frontend, so
   this one just needs a real-world timing check on your end.

## Not included (unchanged / not relevant to this fix)

Every other frontend page (account.html, onboarding.html, assessment.html, etc.),
seed scripts, and local database files — none of those were touched.
