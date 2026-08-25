# Round 19 — full-screen load cover: the old copy is never on screen again

Per your direct instruction: "I want that copy gone forever never to be seen again... I'd prefer to have a full screen loading screen if we need a few seconds."

## What changed

The root problem across every "old copy" / "stuck on Loading" report was the same thing: the page's real content only replaces its placeholder text once loading finishes. Until now, that placeholder text (and the "Loading…" header) sat in plain view the whole time it was loading — which is exactly what kept reading as "old" or "cached," no matter how many times the underlying data issue got fixed.

This round removes that placeholder text from view entirely, structurally, rather than trying to make it finish loading faster:

- A full-screen cover (Verilume mark + spinner, "Loading your Portal…") is now the very first thing on the page — it paints before anything else, sitting above every other element. **Nothing underneath it is ever visible while it's up** — not the "Loading…" header, not the default placeholder headline, nothing.
- It only lifts once the page has real content ready to show — not the moment the account data technically arrives, but after everything on screen has actually rendered.
- If something goes wrong — the same hang from the last round, or anything else that stops the page from finishing — the cover itself switches to a plain, honest message with a **Retry** button, instead of a banner sitting next to stale content. There is exactly one loading/error state now, not two overlapping ones.

## What this means for you

Reload the portal and you'll either see the cover with a spinner for a moment, then the real page — or, if something's genuinely wrong, a clear "this is taking longer than expected" message with a Retry button. You will not see "The experience, working — and here's the proof." or any other placeholder text flash on screen again, regardless of how long the actual load takes.

## Files in this delivery

- `portal.html` — overwrite in place at `frontend/portal.html`.

## Testing performed before this delivery

- JS syntax check across the full file (clean)
- Playwright: confirmed the cover is already up the instant the page starts loading (before any data arrives)
- Playwright: confirmed a healthy load fades the cover out only after the real "Good morning" greeting and content have rendered — placeholder text never appears
- Playwright: confirmed a forced hang (the same 401 + stalled-redirect scenario from the last round) correctly drives the cover into the Retry state after 15 seconds
- Visual screenshots of both the loading state and the Retry state — both included below
- `<div>` balance re-checked against this file's known +2 baseline (unchanged)
- Build stamp: `2026-08-25-fullscreen-load-cover`
