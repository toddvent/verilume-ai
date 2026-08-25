# Round 18 — "stuck on Loading" watchdog + old voice widget removed from deeper pages

Two fixes, both in `portal.html` only.

## 1. The "stuck on Loading…" hang now surfaces a visible error

Your last two screenshots showed the header still stuck on "Loading…" even after the "Access My Portal" link fix. That earlier fix was real and verified, but it wasn't the whole story — this is the deeper issue.

**What's going on:** the account-loading sequence, if the backend says you're not logged in, redirects you to the login page and then waits — by design, on a promise that only ends when that redirect actually completes. If that navigation stalls for any reason, everything downstream just sits there forever with no error shown. That matches your symptom exactly.

**What this fix does**, since I don't yet have a console/network screenshot to confirm the exact trigger:
- Console logging at every decision point in the account-loading logic, so if this happens again, a console screenshot will show exactly where it's stuck.
- A 15-second watchdog: if the header is still on "Loading…" after 15 seconds, a banner now appears with a **Retry** link. Verified via Playwright on both a healthy load (banner never appears) and a forced hang (banner appears with the right diagnostic log).

## 2. Removed the old conversational/voice widget from deeper pages

Per your note: "We have pages with the correct new Eleven Labs experience under the navigation and the old footprint on some deeper pages... The old experience should be deleted."

That old footprint was a leftover per-workstream widget — the gold avatar bubble, "Ask about this workstream…" input, mic button, and suggested-prompt chips — that showed up on six pages: Strategy/Brand/Marketing group pages, Experience Management, Campaign Management, Search Optimization, Reputation, and Manage Account. It predates the persistent "Ask Verilume" bar now pinned under the nav on every page (mic icon, "Voice · Enterprise" badge) and did the exact same job. A prior round already hid this same widget on the main Dashboard page, but missed these six workstream-level copies — that gap is what you were seeing.

It's removed from all six pages now. The "new" Ask Verilume bar under the nav is untouched — that one stays, since it's the correct current experience.

## Files in this delivery

- `portal.html` — overwrite in place at `frontend/portal.html`.

## Testing performed before this delivery

- JS syntax check across the full file (clean)
- Playwright: forced-hang scenario (401 + a login redirect that never completes) confirmed the watchdog banner and diagnostic console logs both fire correctly at 15s
- Playwright: healthy load confirmed the banner never appears
- Playwright: visited all six workstream/group pages and confirmed no old mic button or conversational box renders on any of them, while the new Ask Verilume bar's own mic (in the header) is unaffected
- Build stamp: `2026-08-25-remove-old-workstream-voice-widget`
