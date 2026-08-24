# Verilume — nav redesign round 17: navy header/nav rebuild (2026-08-24)

Only `portal.html` changed this round — backend/config are untouched, no
need to re-upload those.

## What changed

The header, primary nav, and Ask Verilume bar are rebuilt to match the
approved comps exactly (fixed navy + amber, not the app's old light/minimal
header):

- Full-bleed navy header bar: amber initials avatar badge, company name +
  "Verilume Portal" subtitle, Client ID display (restored — this had been
  removed from the header in an earlier round), user initials avatar,
  settings gear.
- Navy primary nav with numbered tabs (01 Daily Brief through 06 Account
  Management), bold white + amber underline when active.
- Ask Verilume bar restyled with an amber mic icon and a "VOICE ·
  ENTERPRISE" badge (matches the comps — this is a tier-gate label, not a
  "not built yet" one; the voice feature itself is still UI-shell-only,
  unchanged from before).

Build stamp: `2026-08-24-navy-header-nav-rebuild` — confirm this shows in
the browser console after a hard refresh.

## Upload steps (learned from the folder-path issue last time)

1. In GitHub, navigate into the existing `frontend/` folder first.
2. Upload this single `portal.html` file there (do NOT drag the folder) —
   it should overwrite the existing file at `frontend/portal.html`.
3. Push/commit; Vercel auto-deploys.
4. Hard refresh and check the console for the build stamp above.

## Still open

The tile-by-tile "Pending Development" vs. "Enterprise" badge audit across
all six tabs (task #35) needs the comp images again to do accurately — I
don't have them saved anywhere in this session (they came through as
inline attachments earlier and didn't persist as files). If you can
re-attach them, or confirm the badge list from memory, I'll finish that
pass plus the stat-card/Top 5 table verification (task #36) right after.
