#!/bin/bash
# Verilume — reset the demo back to its clean seeded baseline.
#
# Restores backend/cxmedia.db from the frozen snapshot taken right after the
# demo account was first seeded (backend/cxmedia.baseline.db) — this wipes
# out anything added or changed during a demo (new campaigns, approved
# requirements, added invoices, etc.) and puts Atlas Ocean Voyages back to
# exactly the state described in README-DEMO.md.
#
# Safe to run any time the demo backend is stopped. If the backend is still
# running, this script stops it first (same as closing the demo window would).

set -e
cd "$(dirname "$0")"

BASELINE="backend/cxmedia.baseline.db"
LIVE="backend/cxmedia.db"

if [ ! -f "$BASELINE" ]; then
  echo "No baseline snapshot found at $BASELINE — nothing to reset to."
  echo "(This ships with the package; if it's missing, something's wrong with this copy.)"
  read -p "Press Enter to close..."
  exit 1
fi

# Stop the backend if it's currently running, so nothing is writing to the
# db file while we overwrite it.
if command -v pkill >/dev/null 2>&1; then
  pkill -f "backend/server.js" 2>/dev/null || true
  sleep 1
fi

cp "$BASELINE" "$LIVE"
echo "Done — backend/cxmedia.db has been reset to the clean seeded baseline."
echo "Run start-demo again (or start-demo.command/.bat) to relaunch the demo."
read -p "Press Enter to close..."
