# Running the API as a long-lived service

The backend (`backend/server.js`) can run two ways:

| Mode | Entry | Where | Trade-off |
|---|---|---|---|
| Serverless (current) | `api/[...path].js` → `handleRequest` | Vercel | Cold starts re-load the whole module and re-open the Postgres pool; one request per instance; the sync DB bridge blocks that instance's event loop on every query. |
| **Long-lived service** | `backend/serve.js` → `handleRequest` | Railway / Render / Fly / any container host | Module loads once; the pg pool stays connected; the AI Brain's in-memory context cache stays warm; a small cluster of workers serves requests in parallel. |

`server.js` is identical in both modes — `serve.js` only owns listening, the worker cluster, health, and graceful shutdown.

## Deploy (Railway, ~15 minutes)

1. **New project → Deploy from GitHub repo** → pick this repo. Railway detects `Dockerfile` (and `railway.json`) automatically. Start command is `node backend/serve.js`; health check is `/api/health`.
2. **Variables** — copy every value from the Vercel project's Environment Variables, at minimum:
   `DATABASE_URL` (Supabase Postgres — the service refuses to start without it), `ANTHROPIC_API_KEY`, `ADMIN_API_TOKEN`, `CRON_SECRET`, and whichever of `OPENAI_API_KEY` / `GEMINI_API_KEY` / `XAI_API_KEY` / `PERPLEXITY_API_KEY` / `POSTMARK_*` / `TWILIO_*` / `HUBSPOT_*` / `GA4_SERVICE_ACCOUNT_KEY_JSON` / `SNOWFLAKE_*` / `CENSUS_API_KEY` / `CLOUDMERSIVE_API_KEY` are set there. Add `NODE_ENV=production`. Optional: `WEB_CONCURRENCY=2` (workers; default = CPUs, capped at 4).
3. **Region** — pick the region closest to the Supabase project (the DB bridge makes many small round trips; same-region is worth 5–20 ms per query).
4. **Generate a domain** (or attach `api.<yourdomain>`), then confirm `https://<host>/api/health` returns `{"ok":true,"db":"Supabase/Postgres (DATABASE_URL set)", ...}`.

Render: same steps using `render.yaml` (Blueprint) or a Docker web service. Fly: `fly launch` picks up the Dockerfile; set secrets with `fly secrets set`.

## Point the site at it

Keep the frontend on Vercel. Change ONE line in `vercel.json` so `/api/*` proxies to the service instead of the serverless function:

```json
{ "source": "/api/(.*)", "destination": "https://<host>/api/$1" }
```

(replacing the existing `{ "source": "/api/(.*)", "destination": "/api/[...path]" }`). The site-wide gate in `middleware.js` still runs at the edge in front of every `/api/*` call, the two Vercel crons keep hitting the same `/api/cron/*` paths (set `CRON_SECRET` on the service too), and the frontend needs no change — `BACKEND_URL` stays same-origin.

**If streamed AI Brain replies arrive all at once** (browser console shows `[ai-brain] first byte took …ms — the host may be buffering`), the proxy is buffering. Bypass it for API calls only: set `<meta name="verilume-backend-url" content="https://<host>">` in `frontend/portal.html`'s `<head>`. CORS is already open on the backend; the app's own session auth still applies to every call.

## Roll back

Restore the original `vercel.json` rewrite line and redeploy — the serverless path is untouched and keeps working. Nothing about the database changed.

## Local

`npm start` runs the cluster on `:8787` against the local SQLite file (no `DATABASE_URL`); `npm run start:dev` runs the single-process server as before.

## What this does NOT do yet

The DB layer is still `pg-sync-bridge` (synchronous, one query at a time per worker). In a long-lived process that costs a few ms per query rather than a cold pool, and the worker cluster keeps one slow request from blocking others — but a true async `pg` layer (parallel queries inside one request) is a separate, larger refactor across ~800 `db.prepare()` call sites. Not started.
