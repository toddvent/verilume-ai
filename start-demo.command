#!/bin/bash
# Verilume — self-contained demo launcher (Mac/Linux)
# Double-click start-demo.command instead if you're on a Mac and don't want
# to use a terminal. This script does the same thing either way.
#
# Run reset-demo.sh (or .command) any time to wipe out whatever you've added
# during a demo and restore the clean seeded baseline.

set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed (or isn't on your PATH). This demo needs Node.js 22.5 or newer — https://nodejs.org"
  read -p "Press Enter to close..."
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "This demo needs Node.js 22.5 or newer (found $(node -v)). Please upgrade Node — https://nodejs.org"
  read -p "Press Enter to close..."
  exit 1
fi

DB_FILE="backend/cxmedia.db"
BASELINE_FILE="backend/cxmedia.baseline.db"
NEEDS_SEED_FALLBACK=0

if [ ! -f "$DB_FILE" ]; then
  if [ -f "$BASELINE_FILE" ]; then
    echo "First run — restoring the clean seeded baseline (Atlas Ocean Voyages, fully populated)..."
    cp "$BASELINE_FILE" "$DB_FILE"
    echo ""
  else
    # No baseline snapshot shipped with this copy for some reason — fall
    # back to running the seed scripts live, same as this package's earlier
    # behavior. This needs the backend already up (see below), since the
    # seed scripts write columns the server's own startup migration adds.
    NEEDS_SEED_FALLBACK=1
  fi
fi

echo "Starting the local demo backend on http://localhost:8787 ..."
node backend/server.js &
SERVER_PID=$!

cleanup() {
  echo ""
  echo "Stopping the demo backend..."
  kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

echo -n "Waiting for the backend to come up"
for i in $(seq 1 20); do
  if curl -s -o /dev/null "http://localhost:8787/api/health"; then
    echo " ready."
    break
  fi
  echo -n "."
  sleep 0.5
done

if [ "$NEEDS_SEED_FALLBACK" -eq 1 ]; then
  echo ""
  echo "No baseline snapshot found — seeding the Atlas Ocean Voyages demo account live instead..."
  node backend/seed-atlas-demo.js
  node backend/seed-atlas-demo-extras.js
  echo ""
fi

INDEX_PATH="$(pwd)/frontend/index.html"
echo "Opening the demo in your browser..."
if command -v open >/dev/null 2>&1; then
  open "$INDEX_PATH" || echo "Couldn't auto-open a browser — open this file manually: $INDEX_PATH"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$INDEX_PATH" || echo "Couldn't auto-open a browser — open this file manually: $INDEX_PATH"
else
  echo "Open this file in your browser manually: $INDEX_PATH"
fi

echo ""
echo "============================================================"
echo " Verilume demo is running."
echo ""
echo " Full funnel (marketing site -> assessment -> onboarding):"
echo "   already open, starting at index.html"
echo ""
echo " Jump straight into the fully-populated demo account:"
echo "   frontend/portal.html?accountId=CXM-NAT-2026-700"
echo "   Access code: ATLAS-DEMO1"
echo ""
echo " See README-DEMO.md for the full script and talking points."
echo ""
echo " Anything you click through or add is real and persists between"
echo " launches. Run reset-demo.sh (or reset-demo.command) any time to"
echo " wipe it back to this clean seeded starting point."
echo ""
echo " Leave this window open for the whole demo — it's running the"
echo " backend. Press Ctrl+C here (or just close this window) when done."
echo "============================================================"
wait $SERVER_PID
