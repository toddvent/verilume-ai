# Round 20 — pending-feature breadcrumb fix

Fixes the exact bug in your screenshot: on any not-yet-built page reached from a tile grid (e.g. Brand → Creative Production → Experience Development), the breadcrumb's middle link ("Creative Production") was hardcoded to always jump to the Daily Brief dashboard — the same destination as the top-level "Atlas Ocean Voyages Dashboard" link, making the middle crumb pointless.

Fixed: the middle crumb now returns to the actual tab it came from (Strategy, Brand, Marketer, Data Scientist, or Account Management), so each level of the breadcrumb goes somewhere different and correct. Verified via Playwright on both Brand and Strategy.

This is a narrow, contained fix — it doesn't touch the broader SEO/AEO/GEO or security questions from your message, which I'm responding to separately since those need your input on scope before I build anything.

## Files in this delivery

- `portal.html` — overwrite in place at `frontend/portal.html`.
