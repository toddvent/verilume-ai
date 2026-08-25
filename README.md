# Consolidated build — 2026-08-25

A full snapshot of the current `backend/` and `frontend/` source (minus `node_modules` and the local `.db` data files — run `npm install` in `backend/` after unpacking). This delivery adds the two build projects approved today on top of everything already live (including the real-website-fetch work from earlier today, now that `ANTHROPIC_API_KEY` is deployed).

## What's new this round

### 1. Contest-Winner Priority Model

When a client runs a blind-test contest and picks a winner, that model now becomes the standing default for future single-draft generation of that task type on their account — until they run another contest and pick a new winner.

- New table `account_priority_models` (one row per account + task type; `loopStage` column included but unused — see "Deferred" below).
- Selecting a winner on the existing marketing-copy interview (`POST /api/campaigns/:id/copy-interview/:id/select`) now also upserts the account's priority model for `marketing_copy`.
- `generateMessagingCopyViaAI` now checks for a priority model first: if the winning vendor's API key is still configured, it dispatches through that vendor instead of the hardcoded Anthropic call. Any dispatch failure, or a vendor key that's since been pulled from the deployment ("stale"), falls straight through to the existing Anthropic/template fallback — an account can never lose the ability to generate copy over a stale pick.
- **New: PR Copy Contest.** PR copy (press releases, editorial pitches, corporate comms) had no blind-test mechanism at all before this — necessary groundwork before a "PR winner becomes default" rule had anything to select from. New table `pr_copy_interviews`, and new `POST .../interview` + `POST .../interview/:id/select` endpoints on all three PR surfaces (`press-releases`, `editorial-pitches`, `corporate-comms`). Runs Anthropic plus every configured vendor (OpenAI/Gemini/Grok/Perplexity) on the same brief — unscored (no relevance/compliance model applies to a press release the way it does to campaign copy), so every candidate is shown for a human to read and pick, same as an unconfigured vendor's honest placeholder elsewhere in this build. Winner selection here also upserts the account's `pr_copy` priority model, and `draftPrCorpCommCopyViaAI` (used by both the single-shot generate-draft endpoints and the new contest panel) now dispatches through it the same way.
- **Deferred, per the design doc:** per-Loop-Stage priority (schema is ready, lookups ignore it for now) and the `analytics_readout` task type (that section of the product doesn't exist yet).
- The standing "never reveal the actual model to the client" policy is preserved — priority-model bookkeeping stores vendor/model for admin visibility only; nothing client-facing ever names which vendor won.

### 2. Brand Copy Website Examples

Lets a client include or exclude specific pages, whole directories, or their entire site as real copywriting inputs — separate from, and a sibling step to, Sample Writings & Presentations.

- New table `brand_copy_website_examples`. New endpoints: `POST` / `GET` / `DELETE /api/accounts/:id/brand-copy-website-examples`.
- Query strings are always stripped. Up to 5 directory/site entries and 20 page entries, counted together across includes and excludes.
- Adding a rule validates against everything already on file first — exact duplicates, opposite-mode conflicts, and "already covered by an existing directory rule" are all rejected with a specific, correctable reason (never a silent dedupe or a silent accept).
- Directory/site rules resolve via the site's `sitemap.xml` (same-origin filter, dedupe, prefix filter, cap enforcement with an explicit truncation note when a site has more pages than budget remains). A sitemap **index** file (one that lists other sitemap files) isn't supported yet — that's an honest failure telling the client to add specific pages instead, not a silent partial result. Individual page fetches reuse the same `fetchAndExtractPage()` helper the real-website-fetch work built earlier today.
- Wired into copy generation: a new `brandCopyWebsiteExampleContext()` sits alongside the existing `brandWritingSampleContext()` and feeds both `generateMessagingCopyViaAI` and `draftPrCorpCommCopyViaAI` (and, by extension, the PR contest panel above, which shares that same prompt builder).
- New portal UI step, **Website Examples**, added to Brand Groundwork right after Sample Writings & Presentations (add-rule form, rules list with resolved-page counts, live cap usage).
- **Deferred, per the design doc:** rescan/refresh of an existing directory/site rule, and sitemap-index support — both explicitly out of scope for this build.

## Files touched

- `backend/server.js`
- `backend/schema-identifiers.json` (new camelCase columns registered for the SQLite→Postgres identifier-quoting path — see the file's own comment block if this list needs regenerating later)
- `frontend/portal.html`
- `frontend/assessment.html` *(from earlier today's real-website-fetch work — included since this is a full consolidated snapshot, not a diff)*

## Testing performed before this delivery

- `node --check` on `backend/server.js` and both frontend files' inline scripts after every change.
- Ran the backend against a scratch copy of the database and exercised, end to end, over real HTTP:
  - Website Examples: add page/directory/site rules, exact-duplicate rejection, opposite-mode conflict rejection, "exclude entire site" rejection, sitemap honest-failure (no sitemap on file), cap usage tracking, delete cascade.
  - Priority Model: selected a non-Anthropic winner on a marketing-copy interview, confirmed the `account_priority_models` row was written correctly, confirmed the next generation call dispatched through that vendor when its key was configured, and confirmed it fell back to Anthropic honestly both when the vendor key was stale/missing and when the vendor call itself failed.
  - PR Contest: ran the panel end to end (Anthropic + 4 vendor placeholders, correctly redacted for the client), confirmed `/select` rejects a candidate with no real copy rather than silently accepting one.
- Not yet exercised against live vendor traffic (real API keys) — same caveat this build's existing multi-vendor integration already carries; the honest per-candidate failure path is what surfaces if a vendor's response shape has drifted since this was written, not a crash.
