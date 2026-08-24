# CXMedia.AI Portal — Round 17 Design Fixes

Build stamp: `2026-08-24-full-width-mobile-nav-polish`
(check the browser console after deploy — it logs this on load)

## What's in this package

One file: `portal.html`. Upload it to the existing frontend folder on
GitHub, replacing the current file.

## The root cause of "the old format appears cached"

This wasn't a caching problem. The page's init code (the big startup
function that runs once on page load) never called two of last round's
new render functions — `renderStatCards()` and
`renderPrimaryTabHeaderText()` — it only called them from inside
`switchPrimaryTab()`, i.e. when someone clicked a nav tab. So a genuinely
fresh page load rendered the raw HTML placeholder ("The experience,
working — and here's the proof.", an empty stat-card grid, and the old
generic "AI Agent Thoughts" card with no tab-scoped title) until you
clicked something — which looks exactly like a stale cached build, but
was actually a real bug. Fixed by calling both functions (plus syncing
the new mobile nav dropdown) in the init sequence itself. Verified with a
Playwright test that loads the page and checks the dashboard step
without ever clicking a tab — "Good morning." and the stat cards now
render immediately.

If you still see anything that looks stale after this deploy, a hard
refresh (Cmd/Ctrl+Shift+R) rules out a leftover browser cache, and the
console's build-stamp line above confirms which file is actually loaded.

## Fixes from this round's feedback

**1. Full page width** — the whole app shell was capped at 1040px, which
read as a narrow centered column on any real monitor. Widened to 1440px
(header, nav, and Ask Verilume bar all still line up edge-to-edge).

**2. Mobile navigation** — the six-tab row no longer fits on a phone
screen without horizontal scrolling. Below 760px it's now a native
dropdown showing the same six tabs; picking one calls the same
navigation as the desktop buttons, and the two stay in sync either way.

**3. Removed the small eyebrow text** ("CMO Dashboard," "Daily Brief ·
Home," etc.) directly under the Ask Verilume bar on the dashboard — it
read as visual clutter directly under the page's real title.

**4. AI Agent Thoughts is Daily-Brief-only** — the card no longer shows
on Strategy/Brand/Marketer/Data Scientist/Account Management.

**5. Top 5 Most Urgent always shows its table** — Campaign Code / Name /
Assets Due / Start / End columns render even with zero campaigns, with a
"No Campaigns Have Been Added" row in place of data, instead of the whole
table disappearing behind a sentence.

**6. Visual polish** — real shadows + a subtle hover lift on every card
type (stat cards, tile cards, curated news, key observations, role
tiles, AI partner tiles) in place of flat borders, a bolder page-title
weight, and more generous spacing throughout — aiming for the crisp,
premium feel the comps have rather than a wireframe-flat layout.

## Testing performed before this delivery

- JS syntax check across every `<script>` block — clean
- Playwright screenshots at 1600px, 1440px, 1280px, 700px, and 390px
- A dedicated fresh-load test (page load → dashboard step, no tab click)
  confirming the init-sequencing bug is actually fixed, not just masked
  by a test that happened to click a tab first
- Click-through of all 6 nav tabs confirming the AI Agent Thoughts card
  shows only on Daily Brief and every tab's header text updates correctly
- Mobile dropdown exercised via `selectOption()`, confirmed it navigates
  and stays in sync with the desktop buttons
