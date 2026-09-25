# Verilume / CXMedia.AI backend — long-lived API server image (2026-09-25).
# Runs backend/serve.js (a small Node cluster around the unchanged
# backend/server.js handler). Deploy this on Railway, Render, Fly.io, or any
# container host; the Vercel project keeps serving the static frontend and
# proxies /api/* here (see vercel.json's rewrite and the deploy runbook).
#
# Node 22 is required (package.json engines; server.js's local-dev path
# uses node:sqlite, and production uses `pg` against Supabase Postgres).
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies, with a reproducible lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The API reads a few frontend files at runtime (product-docs search index
# builds from frontend/*.html — see server.js near "readFileSync(path.join(
# __dirname, '..', 'frontend'"), so both directories ship in the image.
COPY backend ./backend
COPY frontend ./frontend

# The local demo SQLite database must never ride along into production.
RUN rm -f backend/*.db backend/*.db-journal

EXPOSE 8787
ENV PORT=8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "backend/serve.js"]
