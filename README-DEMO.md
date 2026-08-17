# Verilume — Clickable Demo Package

This is a self-contained copy of the Verilume product — the marketing site, the
free assessment, paid onboarding, the CMO Portal, and account settings — plus
the real local backend that powers it. Nothing here depends on the cloud
session this was built in; it runs entirely on whatever machine you unzip it
onto.

## Requirements

- **Node.js 22.5 or newer.** Check with `node -v`. If you don't have it,
  install from https://nodejs.org (the LTS installer is fine).
- A modern browser (Chrome, Edge, Firefox, Safari).
- No internet connection is required once Node is installed — everything
  runs locally.

## Starting the demo

**Mac:** double-click `start-demo.command`. If macOS blocks it as an
unidentified file, right-click → Open once to approve it.

**Windows:** double-click `start-demo.bat`.

**Any platform, from a terminal:** `bash start-demo.sh`

The first time you run it, it will:
1. Restore the clean seeded baseline for one fully-populated demo account —
   **Atlas Ocean Voyages** — with real campaigns, a team roster, creative
   work, invoices, and everything else described below. This is instant
   (it's a file copy, not a rebuild) and only happens once; every later
   launch skips straight to starting the backend.
2. Start the local backend on `http://localhost:8787`.
3. Open `frontend/index.html` in your default browser.

**Leave the terminal/command window open for the whole demo** — it's running
the backend everything else talks to. Closing it (or hitting Ctrl+C) stops
the demo. Nothing is lost — your data is saved in `backend/cxmedia.db`, and
the next launch picks up right where you left off.

## If a file upload says "Rejected — no virus-scanning provider is configured"

This is the product's real security gate working as intended, not a bug:
every file upload (Marketing Budget Upload, Market Optimization, Sample
Writings & Presentations) routes through a virus-scan check before it's
stored, and this build never marks a file "clean" without a real scanner
actually running it. No scanner is installed by default in a fresh unzip, so
uploads get held back rather than silently accepted unscanned.

Two ways to fix it:

- **Install ClamAV** (free, open source `clamscan`) on the machine running
  the demo, then start the demo normally. It's auto-detected — no
  configuration needed.
- **Windows, for a quick local demo:** double-click
  `start-demo-unscanned-uploads.bat` instead of `start-demo.bat`. This
  starts the exact same demo with the upload gate's explicit dev bypass
  turned on. It does **not** fake a scan result — every file accepted this
  way is tagged `not_configured_dev_bypass` everywhere it's shown in the
  product, so it's never presented as scanned or safe. Don't use this
  outside a local demo.

## Adding data as you go — and resetting afterward

Because this runs the real backend, **anything you click through or add
during a demo is genuinely persisted** — new campaigns, approved Creative
requirements, added invoices, a brand-new account from the onboarding path,
all of it. It's cumulative across launches, not reset automatically.

To wipe everything back to the clean seeded starting point (undoing
anything added or changed, including in the Atlas Ocean Voyages account),
run the reset script any time the demo is stopped:

- **Mac:** double-click `reset-demo.command`
- **Windows:** double-click `reset-demo.bat`
- **Any platform:** `bash reset-demo.sh`

This restores `backend/cxmedia.db` from a frozen snapshot
(`backend/cxmedia.baseline.db`) taken right after Atlas Ocean Voyages was
first seeded — instant, and safe to run as many times as you like before or
between presentations. Run `start-demo` again afterward to relaunch.

(If you'd rather reset by hand: stop the demo, delete `backend/cxmedia.db`,
and start it again — same effect.)

## Two ways to run the demo

### Path 1 — the full funnel, live

Start at `index.html` (already open) and click through for real:
marketing site → **See free assessment** → answer the 17-cell instrument
yourself → free report → **See the paid program** → NDA → contract/SOW →
account provisioning (this creates a genuine new account in the backend,
right in front of the audience) → the brand-new Portal and Account pages for
that account.

This path is best for showing *how the product acquires and onboards a
client* — the account you create here starts empty (no campaigns, no team
yet), which is the honest, real state of a brand-new signup.

### Path 2 — jump straight into a fully-built account

To show the *depth* of what's built without walking through the assessment
live, open this URL directly (also printed in the terminal when the demo
starts):

```
frontend/portal.html?accountId=CXM-NAT-2026-700
```

Log in with:
- **Account ID:** `CXM-NAT-2026-700`
- **Access code:** `ATLAS-DEMO1`

This is **Atlas Ocean Voyages**, a real (if fictional) small-ship expedition
cruise line — this build's designated full-demo brand. Every fact used to
build its assessment/brand content (company history, ships, HQ, named
competitors) was sourced from Atlas's real public pages; colors/fonts are
explicitly labeled illustrative since Atlas's actual brand guidelines were
never sourced for this build.

This account has real, seeded content in every module:

- **Dashboard** — Daily Brief (all 5 Function Groups, since the roster
  includes an Executive/CMO), the Promise-Delivery quadrant and Continuous
  Monitoring trend from a real scored assessment + one re-rating round, and
  10 campaigns spread across Objective & Details / In Market / Analysis.
- **Campaigns** — open **"Antarctica 2027 Season Launch"** to see Campaign
  QA & Alignment fully scored: real marketing Functions activated, and a
  **Creative Messaging Collection** with one Approved video requirement and
  one Ready-for-Handoff social requirement — this is what closes the
  Creative stage of QA (Video/Display project types are intentionally
  unbuilt; the Collection is what actually satisfies that work now).
- **Team & Org Chart** — a real 7-person CMO → Director → Manager →
  Specialist chain across PR and Brand.
- **Analytics Integrations** — a submitted Snowflake pathway request, plus a
  full trailing 12 months (2025-07 through 2026-06) of real logged
  Spend/Reach/Impressions across all 18 MMM categories — a $12M annual
  budget ($1M/month) allocated across categories per this build's own
  best-practice split, with Internal Email and PR run at $0 paid spend
  (both are owned/earned channels, not paid). Open the MMM card to see all
  four steps live: the category-inclusion checklist (all 18 selected),
  the full completeness matrix (216 of 216 period×category combinations
  complete), the partner category-mapping/CSV export, and the "analysis
  readiness & recommended testing" panel — since spend is flat month to
  month, that panel correctly flags every paid category as having limited
  spend variation and both Internal Email and PR as zero-spend, which is
  the honest, real readout of this account's actual logged data, not a
  bug in the demo.
- **Account settings** (`account.html?accountId=CXM-NAT-2026-700`) —
  **Financial Tracking**: 3 real invoices (paid / sent / overdue) and a
  computed financial summary rolling up real campaign budgets against them.

## Suggested talking points

A rough narrative arc, in case it's useful — adjust freely to your audience:

1. **Open with the marketing site** (`index.html`) — the pitch: most brands
   can't tell which of their marketing motions across the customer journey
   (Awareness → Consideration → Purchase → Loyalty → Advocacy) are actually
   working.
2. **Run the free assessment live** (`assessment.html`) — this is the hook:
   a real 17-cell self-assessment producing a real scored report in a few
   minutes, no account needed.
3. **Walk the paid onboarding** (`onboarding.html`) — NDA, contract/SOW,
   then real account provisioning happens on screen. Worth calling out:
   this isn't a fake "account created!" animation — it's a real backend
   call, and the access code shown is the one and only time it's ever
   displayed (same as a real API key).
4. **Pivot to the Atlas Ocean Voyages account** (Path 2 above) to show
   what a mature, active account looks like: real campaigns at every
   lifecycle stage, a scored Campaign QA & Alignment panel, a Creative
   Messaging Collection, a real team org chart, Analytics Integrations,
   and Financial Tracking.
5. **Close on the Daily Brief** at the top of the Dashboard — real,
   sourced articles on how AI is reshaping each marketing function across
   the customer journey, personalized to this account's actual active
   team roster.

## What's genuinely real here, and what's still a prototype

Everything above is real, working code against a real (if local) database —
not a slideshow. A few things are deliberately still mocked, and it's worth
being upfront about them if asked directly:

- E-signature on the NDA/contract steps is a session-only simulation — no
  real e-sign vendor is wired up.
- Card/ACH payment capture on the Account page is a UI mock — no real
  payment processor is connected, and no money moves.
- The CRM sync (HubSpot) and the external analytics connector (Snowflake)
  are both real, working code that's dormant until a real HubSpot/Snowflake
  account is provisioned outside this build — see
  `cxmedia-crm-integration-notes.md` and
  `cxmedia-data-integration-architecture.md` if that comes up.
- The MMM/DMA module logs real historical data but runs no statistical
  model yet — that's an open tool/vendor decision, not a coding gap.

## Files in this package

```
frontend/    — every HTML page (marketing site, assessment, onboarding,
               portal, account settings, print/OOH spec references)
backend/     — the real Node/SQLite backend (server.js), the two seed
               scripts that build the Atlas Ocean Voyages demo account, and
               cxmedia.baseline.db (the frozen clean-state snapshot reset-demo
               restores from)
start-demo.sh / .command / .bat — one-click launchers for Mac/Linux/Windows
start-demo-unscanned-uploads.bat — Windows launcher with the file-upload
               virus-scan gate's dev bypass turned on (see "If a file upload
               says..." above) — use only if start-demo.bat's uploads are
               rejected for lack of a scanner
reset-demo.sh / .command / .bat — wipe added/changed data, restore baseline
```
