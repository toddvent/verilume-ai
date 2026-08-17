/*
  CXMedia.AI — Atlas Ocean Voyages full-demo seed script (added 2026-07-23, round 28)

  Per direct instruction: Atlas Ocean Voyages (atlasoceanvoyages.com) is this
  build's designated full-demo brand, and the demo needs to walk end to end
  — assessment through paid-client Portal features — without hitting
  anything that requires a real 3rd-party integration (auth, payments,
  Supabase, HubSpot, DocuSign, or a real Anthropic API call). Everything
  this script seeds uses only the already-built local demo backend
  (node:sqlite) and the same templated/mocked generator shapes already
  proven out for the Acme Hospitality Group sample account
  (backend/seed-demo.js) — nothing new is invented here architecturally.

  This creates ONE account, fully populated end to end:
    - Company Profile (industry/footprint/audience/wealth)
    - A real 17-cell assessment scorecard + one re-rating round
      (so the Dashboard's Promise-Delivery Map / quadrant, Continuous
      Monitoring trend, and Activation task-list routing all have
      real, non-empty data to show)
    - All three Brand Groundwork gate components, pre-approved:
        Voice, Style Assets (Colors & Fonts), Competitive Positioning
      — so Campaign Creation and Ad Hoc are unlocked from the first click,
      the way they'd be for a client who already completed onboarding.
    - A spread of campaigns/projects at different lifecycle stages
      (Objective & Details / In Market / Analysis), so Campaign Creation,
      Campaign Detail, and Project Detail all have real content to walk
      through, not an empty state.

  Facts used below (company history, fleet, HQ, mission language, and the
  three named competitors) are real, sourced from Atlas Ocean Voyages' own
  About page and Wikipedia (checked 2026-07-23) — the same sourcing already
  used for the Step 1 domain-overview auto-fill in assessment.html. Colors/
  fonts are explicitly labeled illustrative (not pulled from Atlas's actual
  brand guidelines, which weren't sourced for this build) — consistent with
  this project's standing "never assert a fact you didn't actually source"
  rule.

  Usage:  node backend/seed-atlas-demo.js
  Safe to re-run — skips account/scorecard/Brand Groundwork creation if the
  account already exists, and only adds a fresh batch of campaigns each time
  (same idempotent-ish convention as seed-demo.js).
*/

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'cxmedia.db');
const db = new DatabaseSync(DB_PATH);

// Same schema as server.js — CREATE TABLE IF NOT EXISTS + column migrations,
// so this script also works standalone against a brand-new db file.
db.exec(`CREATE TABLE IF NOT EXISTS accounts (accountId TEXT PRIMARY KEY, company TEXT NOT NULL, industry TEXT, footprint TEXT, createdAt TEXT NOT NULL);`);
db.exec(`CREATE TABLE IF NOT EXISTS score_history (id INTEGER PRIMARY KEY AUTOINCREMENT, accountId TEXT NOT NULL, stage TEXT NOT NULL, layer TEXT NOT NULL, score REAL NOT NULL, source TEXT NOT NULL, recordedAt TEXT NOT NULL, FOREIGN KEY (accountId) REFERENCES accounts(accountId));`);
db.exec(`CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, accountId TEXT NOT NULL, objective TEXT NOT NULL, segment TEXT, stage TEXT, keyMessage TEXT, createdAt TEXT NOT NULL, FOREIGN KEY (accountId) REFERENCES accounts(accountId));`);
db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, campaignId TEXT NOT NULL, projectType TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', masterContent TEXT, derivatives TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, FOREIGN KEY (campaignId) REFERENCES campaigns(id));`);
function ensureColumn(table, col, decl){ try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`); } catch (e) {} }
ensureColumn('campaigns', 'name', 'TEXT');
ensureColumn('campaigns', 'budget', 'REAL');
ensureColumn('campaigns', 'plannedImpressions', 'INTEGER');
ensureColumn('campaigns', 'startDate', 'TEXT');
ensureColumn('campaigns', 'endDate', 'TEXT');
ensureColumn('campaigns', 'isAdHoc', 'INTEGER DEFAULT 0');
ensureColumn('campaigns', 'status', "TEXT DEFAULT 'Objective & Details'");
ensureColumn('campaigns', 'actualSpend', 'REAL');
ensureColumn('campaigns', 'actualImpressions', 'INTEGER');
ensureColumn('campaigns', 'actualConversions', 'INTEGER');
ensureColumn('campaigns', 'analysisNotes', 'TEXT');
ensureColumn('campaigns', 'functions', 'TEXT');
ensureColumn('accounts', 'voiceGuideText', 'TEXT');
ensureColumn('accounts', 'voiceApproved', 'INTEGER DEFAULT 0');
ensureColumn('accounts', 'voiceVersion', 'INTEGER DEFAULT 0');
ensureColumn('accounts', 'voiceApprovedAt', 'TEXT');
ensureColumn('accounts', 'audience', 'TEXT');
ensureColumn('accounts', 'wealth', 'TEXT');
ensureColumn('accounts', 'styleAssetsApproved', 'INTEGER DEFAULT 0');
ensureColumn('accounts', 'logoUrl', 'TEXT');
ensureColumn('accounts', 'primaryColorName', 'TEXT');
ensureColumn('accounts', 'primaryColorHex', 'TEXT');
ensureColumn('accounts', 'secondaryPaletteText', 'TEXT');
ensureColumn('accounts', 'headingFontName', 'TEXT');
ensureColumn('accounts', 'headingFontNotes', 'TEXT');
ensureColumn('accounts', 'bodyFontName', 'TEXT');
ensureColumn('accounts', 'bodyFontNotes', 'TEXT');
ensureColumn('accounts', 'styleNotes', 'TEXT');
ensureColumn('accounts', 'styleSourceFileName', 'TEXT');
ensureColumn('accounts', 'styleAssetsApprovedAt', 'TEXT');
ensureColumn('accounts', 'competitivePositioningApproved', 'INTEGER DEFAULT 0');
ensureColumn('accounts', 'competitivePositioningApprovedAt', 'TEXT');
ensureColumn('accounts', 'industryTrendsText', 'TEXT');
ensureColumn('accounts', 'competitorsJson', 'TEXT');

const ACCOUNT_ID = 'CXM-NAT-2026-700'; // this build's fixed, memorable full-demo account id
const COMPANY = 'Atlas Ocean Voyages';
const INDUSTRY = 'Cruise Lines — Luxury';
const FOOTPRINT = 'National';
const AUDIENCE = 'genx,boomer,silent'; // matches Atlas's real, researched target skew
const WEALTH = 'hnw,wealthy';

function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
function isoDate(d){ return d.toISOString().slice(0, 10); }
function addDays(base, days){ const d = new Date(base); d.setDate(d.getDate() + days); return d; }
function genId(prefix){ return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 900 + 100)}-${randInt(1000,9999)}`; }

const now = new Date();

// 1. Account — create if it doesn't already exist.
const existing = db.prepare('SELECT accountId FROM accounts WHERE accountId = ?').get(ACCOUNT_ID);
if (!existing){
  db.prepare('INSERT INTO accounts (accountId, company, industry, footprint, audience, wealth, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(ACCOUNT_ID, COMPANY, INDUSTRY, FOOTPRINT, AUDIENCE, WEALTH, isoDate(addDays(now, -75)) + 'T00:00:00.000Z');
  console.log(`Created account ${ACCOUNT_ID} (${COMPANY}).`);
} else {
  console.log(`Account ${ACCOUNT_ID} already exists — reusing it, only adding a fresh campaign batch below.`);
}

// 2. Assessment scorecard — only seed if this account has no score history
// yet. Illustrative demo scores (same convention as seed-demo.js), not a
// real client audit — chosen to tell a plausible growth-brand story: strong
// on Creative Visuals throughout (the brand's actual visual/expedition
// storytelling is its strongest asset), weak on discovery (Awareness ×
// Search Everywhere — a newer, smaller brand competing against decades-old
// luxury lines for search visibility), weak on the high-touch booking
// handoff (Purchase × Call Center — concierge-level service strained by a
// fast-growing fleet), and weak on delivery consistency as new ships come
// online (Loyalty × Product Delivery).
const RUBRIC_CELLS = [
  ["Awareness","Creative Visuals"], ["Awareness","Search Everywhere (SEO/AEO/GEO)"],
  ["Consideration","Creative Visuals"], ["Consideration","Call Center"], ["Consideration","Search Everywhere (SEO/AEO/GEO)"],
  ["Purchase","Creative Visuals"], ["Purchase","Call Center"], ["Purchase","POS / Team"], ["Purchase","Product Delivery"],
  ["Loyalty","Creative Visuals"], ["Loyalty","Call Center"], ["Loyalty","POS / Team"], ["Loyalty","Product Delivery"],
  ["Advocacy","Creative Visuals"], ["Advocacy","Call Center"], ["Advocacy","POS / Team"], ["Advocacy","Product Delivery"]
];
const existingHistory = db.prepare('SELECT COUNT(*) AS n FROM score_history WHERE accountId = ?').get(ACCOUNT_ID);
if (existingHistory.n === 0){
  const intakeAt = isoDate(addDays(now, -75)) + 'T00:00:00.000Z';
  const insertCell = db.prepare('INSERT INTO score_history (accountId, stage, layer, score, source, recordedAt) VALUES (?,?,?,?,?,?)');
  const WEAK_AT_INTAKE = new Set(['Awareness::Search Everywhere (SEO/AEO/GEO)', 'Purchase::Call Center', 'Loyalty::Product Delivery']);
  const STRONG_CREATIVE = new Set(['Awareness::Creative Visuals', 'Consideration::Creative Visuals', 'Purchase::Creative Visuals', 'Loyalty::Creative Visuals', 'Advocacy::Creative Visuals']);
  RUBRIC_CELLS.forEach(([stage, layer]) => {
    const key = `${stage}::${layer}`;
    let score = 3;
    if (STRONG_CREATIVE.has(key)) score = 3.75;
    if (WEAK_AT_INTAKE.has(key)) score = key.startsWith('Loyalty') ? 1.5 : 1;
    insertCell.run(ACCOUNT_ID, stage, layer, score, 'intake', intakeAt);
  });
  // One round of "since improved" re-rating, ~4 weeks ago — Awareness ×
  // Search Everywhere moved up as the demo's Continuous Monitoring story.
  const rerateAt = isoDate(addDays(now, -28)) + 'T00:00:00.000Z';
  insertCell.run(ACCOUNT_ID, 'Awareness', 'Search Everywhere (SEO/AEO/GEO)', 2.75, 'portal re-rating', rerateAt);
  console.log('Seeded intake score history (17 cells) + one re-rating round.');
} else {
  console.log('Account already has score history — leaving it as-is.');
}

// 3. Brand Groundwork — all three gate components, pre-approved, so the demo
// can jump straight into Campaigns/Projects without walking the setup forms
// live (those forms are still fully there to demo separately if wanted —
// this just means the gate doesn't block a "show me Campaigns" walkthrough).
const acct = db.prepare('SELECT voiceApproved FROM accounts WHERE accountId = ?').get(ACCOUNT_ID);
if (acct && !acct.voiceApproved){
  const voiceGuideText = `${COMPANY} — Brand Voice

One-line description: ${COMPANY} sounds confident, warm, and reassuring — a brand for luxury expedition cruising that speaks to its own guests directly, never templated.

Point of view: Second person throughout — "you," "your voyage," "your cabin" — never "the guest" or third-person distancing.

Tone rules:
- Confident: state the plain claim first, reasoning after — never hedge with "we strive to." This is a brand that pioneered year-round expedition cruising; say so plainly, then back it with the specific itinerary or ship detail.
- Warm: write like someone who was actually on the zodiac at 6am watching the ice calve, not a brochure — specific sensory detail, not generic "unforgettable" language.
- Reassuring: name the actual concern before addressing it — a first-time expedition guest worrying about rough seas or remote medical access deserves a direct answer, not a deflection.

Words to avoid: "unparalleled," "world-class," "bucket-list" (overused category language that says nothing specific about this brand).

What this voice is not: not a mass-market cruise line's upbeat, generic vacation copy — every sentence should read like it could only be about small-ship expedition travel, not "any cruise."

Example sentences in this voice:
- "You'll be on the Zodiac before breakfast — Antarctica doesn't wait for the dining room to open."
- "World Voyager carries 200 guests, not 2,000. That's not a marketing line; it's why you'll know the captain's name by day two."
- "Rough water worries most first-time expedition guests. Here's exactly what World Navigator's stabilizers do, and when we reroute instead of pushing through."`;
  db.prepare('UPDATE accounts SET voiceGuideText = ?, voiceApproved = 1, voiceVersion = 1, voiceApprovedAt = ? WHERE accountId = ?')
    .run(voiceGuideText, isoDate(addDays(now, -70)) + 'T00:00:00.000Z', ACCOUNT_ID);

  // Round 33 — replaced with REAL values from the actual "Atlas Ocean
  // Voyages Mini Brand Guidelines, Version 1.0" (uploaded directly by the
  // user), superseding the illustrative placeholder this seed used to
  // write. Every value below is sourced from that document, not invented.
  db.prepare(`UPDATE accounts SET
      logoUrl = ?, logoUsageNotes = ?, primaryColorName = ?, primaryColorHex = ?, secondaryPaletteText = ?,
      colorHierarchyNotes = ?, headingFontName = ?, headingFontNotes = ?, bodyFontName = ?, bodyFontNotes = ?,
      typographyHierarchyNotes = ?, styleNotes = ?, styleAssetsApproved = 1, styleAssetsApprovedAt = ?
    WHERE accountId = ?`)
    .run(
      '',
      'Approved colorways for every mark (vertical logo, horizontal logo, monogram, wordmark): Full Color (Atlas Deep Purple + Atlas Gold), All Atlas Deep Purple, All White, All Black — the monogram alone also allows All Atlas Gold; the wordmark alone is Deep Purple/White/Black only (no gold). Exclusion zone = 1/3 the mark\'s own height, clear on every side. Minimum size: vertical logo 120px/.375in, horizontal logo 180px/.625in, wordmark 120px/.375in, monogram alone 28px/.125in. Never alter, modify, redraw, rotate, or stretch any mark; never use the wordmark alone unless the monogram is also present in the composition; never place a colored mark on a photo (white or black only on images); never use the mark on an unapproved background color or a low-contrast combination.',
      'Atlas Deep Purple', '#2F0D4D',
      'Atlas Gold — #CEA552\nDark Gold — #A77B10\nLight Purple 2 — #B69ED9\nLight Purple 1 — #EDE7F7\nBlue 3 — #74A2F7\nBlue 2 — #BFE3F2\nBlue 1 — #E3F7FF\nGray 3 — #B1B9BD\nGray 2 — #D2DBDF\nGray 1 — #E9EFF3\nBlack — #171618\nWhite — #FFFFFF',
      'White is the primary background color (the brand\'s "light and crisp nautical feeling"). Atlas Deep Purple is the background for smaller brand-forward elements only — website navbar, primary buttons — never a large field. Atlas Gold can also be used for CTA buttons. Dark Gold, Blue 1-3, Light Purple 1, and Gray 1 are secondary backgrounds only — cards, hover states, never a primary layout background. Light Purple 2 and Gray 2-3 are rare — small graphics only (dividers, tags, lines), never a background. Black substitutes for Deep Purple as body-copy color only on Dark Gold/Blue 1-3/Purple 1/Gray 1-3 backgrounds where Deep Purple doesn\'t read with enough contrast. On top of light photography, marks/copy are Black; on dark photography, marks/copy are White. Misuse to avoid: no gradients, no adjusting a color\'s transparency/opacity, no low-contrast combinations, no colors outside this palette, no low-contrast type especially over photography.',
      'Söhne Breit', 'Contemporary extended sans-serif grotesk (Söhne family, Kris Sowersby / Klim Type Foundry, 2019) — headers and titles, always set in all caps, weights Kraftig (medium) and Dreiviertelfett (bold), tracking varies by use (10-20%). Evokes an "analogue-materiality-meets-modern" register — the brand\'s own description is "the memory of Akzidenz-Grotesk framed through the reality of Helvetica."',
      'Söhne', 'Standard-width member of the same Söhne family — all body copy, weights Buch (regular) and Halbfett (semibold). A third family member, Söhne Mono, is used minimally and only in all caps for labels and tags (e.g. section eyebrows, captions).',
      'H1 (big brand-forward moments only — a print ad, the website splash page): Söhne Breit Kraftig, all caps, 20% tracking, 110% line height. H2 (e.g. "Explore With Us"): Söhne Breit Dreiviertelfett, all caps, 10% tracking, 110% line height. H3 (e.g. "Featured Expeditions"): Söhne Breit Kraftig, all caps, 10% tracking, 120% line height. H4 (e.g. an itinerary name like "Amsterdam to Dublin"): Söhne Breit Dreiviertelfett, all caps, 10% tracking, 120% line height. H2-H4 are the everyday headers; H1 is reserved for hero moments. Body copy: Söhne Buch/Kraftig, 140% line height. Caption/label copy (e.g. "Polar Expeditions", dates, offer tags): Söhne Mono, all caps, 130% line height.',
      'Sourced directly from the "Atlas Ocean Voyages Mini Brand Guidelines, Version 1.0" PDF provided by the client — supersedes this build\'s earlier illustrative placeholder (Deep Navy/Ivory, Newsreader/Inter), which was explicitly disclosed as not sourced from the real brand and should not be used going forward. Trademarked tagline: "Intimate Yachting Expeditions™" (always includes the ™ symbol). Photography direction (from the guide\'s own application examples): real expedition and hospitality moments — guests toasting, a Zodiac railing against open water, a plated meal, the ship itself against polar or Mediterranean landscapes — never staged studio product shots. Two thin parallel rule lines (purple, or gold in polar-themed application) under the header/hero image is a recurring layout device across the guide\'s application examples and is worth reusing as a section-divider motif.',
      isoDate(addDays(now, -68)) + 'T00:00:00.000Z',
      ACCOUNT_ID
    );

  const industryTrendsText = `${INDUSTRY} — Industry Trends

Note: this is Claude reasoning from known category patterns, not a live market-research pull — treat it as a starting hypothesis to sanity-check against real data, not a sourced claim.

Category shape: Luxury and expedition cruise brands serving Gen X, Baby Boomer, and Silent Generation travelers (skewing high-net-worth and wealthy) are increasingly judged less on any single voyage and more on the consistency of the experience across the whole journey — from the first search result through the post-voyage relationship.

What's shifting: expectations set by direct-to-consumer luxury travel brands now travel across categories — response speed on booking questions, personalization of shore excursions, and follow-through after the voyage are compared against the best experience a traveler has had anywhere, not just against other cruise lines.

Where this account's own Media/CX scorecard fits: use the Promise-Delivery Map placement (Dashboard, module 01) alongside this read — a brand strong on Media (as this one is, on Creative Visuals) but weaker on CX in the high-touch booking and delivery layers is especially exposed, since national luxury-travel buyers in this space compare on delivery, not just reach.

Open question this doesn't resolve: which named competitors are actually setting the comparison bar for this account's customers — see Direct Competitors below.`;

  // Real, named competitors — established ultra-luxury/expedition cruise
  // lines Atlas Ocean Voyages actually competes against for the same
  // affluent expedition traveler. Notes below are Claude's own comparative
  // reasoning (why each competes for the same customer), not asserted facts
  // about that competitor's internal strategy, per this build's standing
  // anti-fabrication rule.
  const competitors = [
    { name: 'Seabourn', note: 'Seabourn competes for the same high-net-worth, Boomer/Gen X traveler with an all-suite ultra-luxury model and its own expedition sub-fleet — a much longer-established brand, which makes brand awareness and trust the sharper competitive edge for Atlas rather than price or itinerary breadth.', sourceFileName: '', positioningText: '' },
    { name: 'Silversea', note: 'Silversea competes directly in both ultra-luxury and expedition cruising with a larger, more diversified fleet and decades of brand equity — Atlas\'s edge here is likely agility (newer ships, purpose-built expedition features) rather than scale or legacy trust.', sourceFileName: '', positioningText: '' },
    { name: 'Ponant', note: 'Ponant (French-flagged) competes for the same small-ship expedition traveler with a strong design/culinary identity and deep polar-region expertise — a genuine peer in ship size and itinerary style, making on-board experience and destination access the real points of comparison rather than brand scale.', sourceFileName: '', positioningText: '' }
  ];

  db.prepare('UPDATE accounts SET industryTrendsText = ?, competitorsJson = ?, competitivePositioningApproved = 1, competitivePositioningApprovedAt = ? WHERE accountId = ?')
    .run(industryTrendsText, JSON.stringify(competitors), isoDate(addDays(now, -65)) + 'T00:00:00.000Z', ACCOUNT_ID);

  console.log('Seeded and approved all three Brand Groundwork components (Voice, Style Assets, Competitive Positioning).');
} else {
  console.log('Brand Groundwork already approved for this account — leaving it as-is.');
}

// 4. Campaigns — themed to Atlas Ocean Voyages, spread across past/in-flight/
// upcoming, with a mix of lifecycle statuses so Campaign Creation, Campaign
// Detail (all three lifecycle steps), and Project Detail all have real
// content to demo rather than an empty state.
const OBJECTIVES = [
  'Increase brand awareness', 'Drive direct bookings / leads', 'Launch a new product or offering',
  'Grow loyalty and repeat visits', 'Win back lapsed customers', 'Support a seasonal or timed promotion'
];
const SEGMENTS = ['General / all segments', 'Gen X', 'Boomers', 'High-net-worth', 'Wealthy'];
const STAGES = ['Awareness', 'Consideration', 'Purchase', 'Loyalty', 'Advocacy'];
const NAME_TEMPLATES = [
  'Antarctica 2027 Season Launch', 'Arctic Expedition Early-Booking Push', 'Mediterranean Shoulder-Season Drive',
  'Amazon Voyage Awareness Push', 'World Navigator Guest Referral Drive', 'Past-Guest Loyalty Reactivation',
  'Solo Traveler Cabin Promotion', 'Founders Suite Waitlist Campaign', 'Polar Season Media Push'
];
const KEY_MESSAGES = [
  'Antarctica doesn\'t wait for the dining room to open', 'Small ship, real expedition',
  'Book direct for the best cabin selection', 'You\'ll know the captain\'s name by day two',
  'The voyage your next story starts with'
];
const PROJECT_TYPES = ['press-release', 'social-batch'];
const LIFECYCLE_STATUSES = ['Objective & Details', 'In Market', 'Analysis'];

// Round 27 — a couple of MMM_CATEGORIES per campaign, so the Budget
// screens' Channel Media Mix chart (grouped into Video/Print
// Publications/Direct Mail/Digital/Radio/OOH) has real content to show
// instead of every campaign reading an empty, unset channels field.
const CHANNEL_TEMPLATES = [
  'Direct Mail — Past Guests,Paid Social', 'OTV,Paid Social', 'CTV,Paid Social',
  'Non-Brand Search,Paid Social', 'Brand Search,Programmatic Display', 'Partner Media,Paid Social',
  'Non-Brand Search,Direct Mail — Prospects', 'Linear TV,OTV,Programmatic Display',
  'Direct Mail — Past Guests,OTV', 'Direct Mail — Past Guests,CTV'
];
const insertCampaign = db.prepare(`
  INSERT INTO campaigns (id, accountId, objective, segment, stage, keyMessage, name, budget, plannedImpressions, startDate, endDate, isAdHoc, status, actualSpend, actualImpressions, actualConversions, analysisNotes, createdAt, channels)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?)
`);
const insertProject = db.prepare(`
  INSERT INTO projects (id, campaignId, projectType, status, masterContent, derivatives, createdAt, updatedAt)
  VALUES (?,?,?,?,?,?,?,?)
`);

// Spread across roughly [-50, +35] days from today — past (Analysis-stage),
// in-flight (In Market), and upcoming (still at Objective & Details) —
// enough upcoming ones to populate the Dashboard's "next 5 active
// campaigns" view meaningfully.
const OFFSETS = [-50, -40, -30, -18, -6, 5, 12, 20, 29, 35];
let created = 0;
OFFSETS.forEach((offset) => {
  const start = addDays(now, offset);
  const durationDays = randInt(14, 35);
  const end = addDays(start, durationDays);
  const createdAt = addDays(start, -randInt(2, 6)).toISOString();
  const campaignId = genId('CMP');
  // Lifecycle status follows a plausible timeline: campaigns well in the
  // past have moved to Analysis, recent/in-flight ones are In Market,
  // future ones are still being set up.
  let status, actualSpend = null, actualImpressions = null, actualConversions = null, analysisNotes = null;
  if (offset < -15){
    status = 'Analysis';
    actualSpend = randInt(8, 45) * 1000;
    actualImpressions = randInt(200, 900) * 1000;
    actualConversions = randInt(40, 400);
    analysisNotes = 'Performed in line with plan — direct-booking conversions tracked highest among the Gen X / high-net-worth segment, consistent with this account\'s Promise-Delivery Map placement.';
  } else if (offset < 10){
    status = 'In Market';
  } else {
    status = 'Objective & Details';
  }
  const budget = randInt(10, 60) * 1000;
  const plannedImpressions = randInt(150, 900) * 1000;
  insertCampaign.run(
    campaignId, ACCOUNT_ID,
    pick(OBJECTIVES), pick(SEGMENTS), pick(STAGES), pick(KEY_MESSAGES),
    `${pick(NAME_TEMPLATES)} — ${isoDate(start)}`,
    budget, plannedImpressions,
    isoDate(start), isoDate(end),
    status, actualSpend, actualImpressions, actualConversions, analysisNotes,
    createdAt, CHANNEL_TEMPLATES[created % CHANNEL_TEMPLATES.length]
  );
  created++;

  const projectCount = Math.random() < 0.4 ? 2 : 1;
  for (let p = 0; p < projectCount; p++){
    const projectType = pick(PROJECT_TYPES);
    const pStatus = status === 'Objective & Details' ? (Math.random() < 0.4 ? 'approved' : 'draft') : (Math.random() < 0.75 ? 'approved' : 'draft');
    const projectId = genId('PRJ');
    const master = projectType === 'press-release'
      ? `FOR IMMEDIATE RELEASE\n\n${COMPANY.toUpperCase()} ANNOUNCES NEW VOYAGE PROGRAM\n\n${isoDate(start)}, FORT LAUDERDALE, FL — ${COMPANY}, the small-ship luxury expedition line, today announced new voyage details for ${pick(SEGMENTS).toLowerCase()} travelers aboard its expedition fleet.\n\nAbout ${COMPANY}: ${COMPANY} is a small-ship luxury expedition cruise line operating a fleet of purpose-built expedition yachts to Antarctica, the Arctic, the Mediterranean, and the Amazon.`
      : `${pick(KEY_MESSAGES)} — here's what's new aboard the fleet this season, and why it matters if you've been waiting for the right voyage.\n\nLearn more → [link]`;
    insertProject.run(projectId, campaignId, projectType, pStatus, master, null, createdAt, createdAt);
  }
});

console.log(`Seeded ${created} campaigns (offsets ${OFFSETS.join(', ')} days from today) with 1-2 projects each, spread across Objective & Details / In Market / Analysis lifecycle stages.`);

// 5. Team & Org Chart (added round 30) — a small but real hierarchy so the
// demo shows Validate & QA's "request QA from your direct manager / your
// skip-level manager" working immediately, without a live walkthrough of
// the Add Team Member form first. One CMO, then a Director + Manager for
// each of the two functions this account's two built content types
// (press-release → PR, social-batch → Performance Marketing / Brand)
// actually touch, plus a Specialist under each Manager to act as. Only
// seeds if this account has no team members yet — same guard convention as
// score history and Brand Groundwork above.
db.exec(`
  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    accountId TEXT NOT NULL,
    name TEXT NOT NULL,
    functionGroup TEXT NOT NULL,
    level TEXT NOT NULL,
    reportsToId TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (accountId) REFERENCES accounts(accountId)
  );
`);
const existingTeam = db.prepare('SELECT COUNT(*) AS n FROM team_members WHERE accountId = ?').get(ACCOUNT_ID);
if (existingTeam.n === 0){
  const insertMember = db.prepare(
    'INSERT INTO team_members (id, accountId, name, functionGroup, level, reportsToId, createdAt) VALUES (?,?,?,?,?,?,?)'
  );
  const teamCreatedAt = isoDate(addDays(now, -60)) + 'T00:00:00.000Z';
  const cmoId = genId('TEAM');
  insertMember.run(cmoId, ACCOUNT_ID, 'Dana Whitfield', 'Executive', 'CMO', null, teamCreatedAt);

  const prDirectorId = genId('TEAM');
  insertMember.run(prDirectorId, ACCOUNT_ID, 'Sam Okafor', 'PR', 'Director', cmoId, teamCreatedAt);
  const prManagerId = genId('TEAM');
  insertMember.run(prManagerId, ACCOUNT_ID, 'Renee Castillo', 'PR', 'Manager', prDirectorId, teamCreatedAt);
  const prSpecialistId = genId('TEAM');
  insertMember.run(prSpecialistId, ACCOUNT_ID, 'Theo Marsh', 'PR', 'Specialist', prManagerId, teamCreatedAt);

  const brandDirectorId = genId('TEAM');
  insertMember.run(brandDirectorId, ACCOUNT_ID, 'Ingrid Voss', 'Brand', 'Director', cmoId, teamCreatedAt);
  const brandManagerId = genId('TEAM');
  insertMember.run(brandManagerId, ACCOUNT_ID, 'Priya Shah', 'Brand', 'Manager', brandDirectorId, teamCreatedAt);
  const brandSpecialistId = genId('TEAM');
  insertMember.run(brandSpecialistId, ACCOUNT_ID, 'Jamie Lin', 'Brand', 'Specialist', brandManagerId, teamCreatedAt);

  console.log('Seeded a 7-person team roster with a real CMO → Director → Manager → Specialist chain across PR and Brand.');
} else {
  console.log('Account already has a team roster — leaving it as-is.');
}

console.log(`Done. Load portal.html?accountId=${ACCOUNT_ID} against the running backend to see the full demo account.`);
