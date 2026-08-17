/*
  CXMedia.AI — Atlas Ocean Voyages demo, "extras" pass (added 2026-07-29,
  round 84 — the self-contained clickable demo package).

  seed-atlas-demo.js (round 28) covers Company Profile, Brand Groundwork,
  score history, campaigns/projects, and a 7-person team roster. It predates
  several deliverables built since (Creative Messaging Collection + its QA
  wiring, Financial Tracking, MMM data-input logging, the Analytics
  Integrations request flow, and real auth) — so this account has never had
  activated marketing Functions on a campaign, a Creative Collection, an
  invoice, an MMM input row, an Analytics Integration request, or a claimed
  access code. This script adds exactly those, against the same account
  (CXM-NAT-2026-700), so a click-through demo can show every built feature
  with real content instead of an empty state — without re-running or
  duplicating anything seed-atlas-demo.js already did.

  Idempotent-ish, same convention as the other seed scripts: each section
  checks for its own prior work before writing.

  Usage: node backend/seed-atlas-demo-extras.js
*/

const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'cxmedia.db');
const db = new DatabaseSync(DB_PATH);

const ACCOUNT_ID = 'CXM-NAT-2026-700';
const DEMO_ACCESS_CODE = 'ATLAS-DEMO1';

function genId(prefix){
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 9000 + 1000)}`;
}
function isoDate(d){ return d.toISOString().slice(0, 10); }
function addDays(base, days){ const d = new Date(base); d.setDate(d.getDate() + days); return d; }
const now = new Date();

const account = db.prepare('SELECT accountId, accessCodeHash FROM accounts WHERE accountId = ?').get(ACCOUNT_ID);
if (!account){
  console.error(`Account ${ACCOUNT_ID} not found — run seed-atlas-demo.js first.`);
  process.exit(1);
}

// ---------- 1. Claim a memorable access code, so a presenter doesn't have
// to improvise one live (still a real, hashed credential — never stored
// in plaintext, same as any real account's). Skipped if this account
// already has one, so re-running never resets a code someone picked. ----------
if (!account.accessCodeHash){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(DEMO_ACCESS_CODE, salt, 64).toString('hex');
  db.prepare('UPDATE accounts SET accessCodeHash = ?, accessCodeSalt = ? WHERE accountId = ?').run(hash, salt, ACCOUNT_ID);
  console.log(`Claimed access code for ${ACCOUNT_ID}: ${DEMO_ACCESS_CODE}`);
} else {
  console.log(`${ACCOUNT_ID} already has an access code — leaving it as-is (see the demo README for the code on file).`);
}

// ---------- 2. Activate real marketing Functions on a couple of campaigns,
// so Campaign QA & Alignment has something to score (seed-atlas-demo.js
// left every campaign's `functions` column blank). ----------
const campaigns = db.prepare('SELECT id, name, status FROM campaigns WHERE accountId = ? ORDER BY createdAt ASC').all(ACCOUNT_ID);
if (!campaigns.length){
  console.error(`No campaigns found for ${ACCOUNT_ID} — run seed-atlas-demo.js first.`);
  process.exit(1);
}
const inMarketOrAnalysis = campaigns.filter(c => c.status === 'In Market' || c.status === 'Analysis');
const showcaseCampaign = inMarketOrAnalysis[0] || campaigns[0];
const secondCampaign = campaigns.find(c => c.id !== showcaseCampaign.id && (c.status === 'In Market' || c.status === 'Analysis')) || campaigns[1];

function ensureFunctions(campaignId, functionsCsv){
  const row = db.prepare('SELECT functions FROM campaigns WHERE id = ?').get(campaignId);
  if (row && !row.functions){
    db.prepare('UPDATE campaigns SET functions = ? WHERE id = ?').run(functionsCsv, campaignId);
    return true;
  }
  return false;
}
const setShowcase = ensureFunctions(showcaseCampaign.id, 'PR,Brand,Performance Marketing,Media Planning & Ops,Advanced Analytics');
const setSecond = secondCampaign ? ensureFunctions(secondCampaign.id, 'Brand,Performance Marketing') : false;
if (setShowcase || setSecond){
  console.log(`Activated marketing Functions on ${[setShowcase && showcaseCampaign.name, setSecond && secondCampaign && secondCampaign.name].filter(Boolean).join(' and ')}.`);
} else {
  console.log('Showcase campaigns already have Functions activated — leaving as-is.');
}

// ---------- 3. A Creative Messaging Collection with one Approved
// requirement on the showcase campaign, so Campaign QA's Creative bucket
// (wired to this in round 82) actually reads Complete instead of the
// structurally-impossible-before-round-82 "missing" state. ----------
const existingCollections = db.prepare('SELECT COUNT(*) AS n FROM creative_collections WHERE campaignId = ?').get(showcaseCampaign.id);
if (!existingCollections.n){
  const collectionId = genId('CMC');
  const createdAt = addDays(now, -8).toISOString();
  db.prepare('INSERT INTO creative_collections (id, accountId, campaignId, name, createdAt, updatedAt) VALUES (?,?,?,?,?,?)')
    .run(collectionId, ACCOUNT_ID, showcaseCampaign.id, 'Launch Wave — Video & Social', createdAt, createdAt);

  const req1Id = genId('REQ');
  db.prepare(`INSERT INTO creative_requirements
    (id, collectionId, channel, mediaType, specs, copyStructureJson, copyContentJson, status, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(req1Id, collectionId, 'Video', '15-second pre-roll', '1920x1080, 15s, captioned',
      JSON.stringify({ hook: 'Open on the destination hero shot', body: 'Name the itinerary and the one thing that makes it rare', endCard: 'Book by [date] — logo + URL' }),
      JSON.stringify({ hook: 'The Northwest Passage, once a season.', body: 'Atlas Ocean Voyages’ Arctic Expedition sails a route most ships never attempt — 12 guests to every crew member, every landing led by an expedition team.', endCard: 'Reserve your suite — atlasoceanvoyages.com' }),
      'Approved', createdAt, addDays(now, -2).toISOString());

  const req2Id = genId('REQ');
  db.prepare(`INSERT INTO creative_requirements
    (id, collectionId, channel, mediaType, specs, copyStructureJson, copyContentJson, status, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(req2Id, collectionId, 'Social', 'Instagram carousel', '1080x1350 x4 cards',
      JSON.stringify({ hook: 'Card 1 — destination hook', body: 'Cards 2-3 — itinerary highlights', cta: 'Card 4 — CTA + link-in-bio' }),
      JSON.stringify({ hook: 'Where the map runs out.' }),
      'Ready for Handoff', createdAt, createdAt);

  db.prepare('UPDATE creative_collections SET updatedAt = ? WHERE id = ?').run(addDays(now, -2).toISOString(), collectionId);
  console.log(`Seeded a Creative Messaging Collection on "${showcaseCampaign.name}" (1 Approved Video requirement, 1 Ready-for-Handoff Social requirement).`);
} else {
  console.log('Showcase campaign already has a Creative Messaging Collection — leaving as-is.');
}

// ---------- 4. A real invoice ledger + a couple of invoices at different
// statuses, so Financial Tracking (account.html) has real rows and the
// financial-summary rollup has something to compute. ----------
const existingInvoices = db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE accountId = ?').get(ACCOUNT_ID);
if (!existingInvoices.n){
  const inv1 = genId('INV');
  db.prepare(`INSERT INTO invoices (id, accountId, invoiceNumber, description, amount, status, issuedDate, dueDate, paidDate, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(inv1, ACCOUNT_ID, 'INV-1001', 'Verilume — monthly retainer, June', 4800,
      'paid', isoDate(addDays(now, -55)), isoDate(addDays(now, -25)), isoDate(addDays(now, -30)),
      addDays(now, -55).toISOString(), addDays(now, -30).toISOString());
  const inv2 = genId('INV');
  db.prepare(`INSERT INTO invoices (id, accountId, invoiceNumber, description, amount, status, issuedDate, dueDate, paidDate, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(inv2, ACCOUNT_ID, 'INV-1002', 'Verilume — monthly retainer, July', 4800,
      'sent', isoDate(addDays(now, -12)), isoDate(addDays(now, 18)), null,
      addDays(now, -12).toISOString(), addDays(now, -12).toISOString());
  const inv3 = genId('INV');
  db.prepare(`INSERT INTO invoices (id, accountId, invoiceNumber, description, amount, status, issuedDate, dueDate, paidDate, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(inv3, ACCOUNT_ID, 'INV-0997', 'Arctic Expedition launch — media buy pass-through', 12500,
      'overdue', isoDate(addDays(now, -40)), isoDate(addDays(now, -10)), null,
      addDays(now, -40).toISOString(), addDays(now, -40).toISOString());
  console.log('Seeded 3 invoices (paid, sent, overdue).');
} else {
  console.log('Account already has invoices — leaving as-is.');
}

// ---------- 5. A handful of MMM data-input rows (Deliverable #8's
// data-logging ledger), so the Analytics Integrations page's "MMM data
// inputs" readiness count shows real logged history. ----------
const existingMmm = db.prepare('SELECT COUNT(*) AS n FROM mmm_inputs WHERE accountId = ?').get(ACCOUNT_ID);
if (!existingMmm.n){
  const rows = [
    ['2026-Q1', 'Search', 42000, 'Bookings', 210],
    ['2026-Q1', 'Social', 31000, 'Bookings', 95],
    ['2026-Q1', 'Video', 55000, 'Bookings', 140],
    ['2026-Q2', 'Search', 47000, 'Bookings', 240],
    ['2026-Q2', 'Social', 36000, 'Bookings', 118],
    ['2026-Q2', 'Video', 60000, 'Bookings', 165]
  ];
  const insert = db.prepare('INSERT INTO mmm_inputs (id, accountId, periodLabel, channel, spend, outcomeMetric, outcomeValue, createdAt) VALUES (?,?,?,?,?,?,?,?)');
  rows.forEach(([periodLabel, channel, spend, outcomeMetric, outcomeValue], i) => {
    insert.run(genId('MMM'), ACCOUNT_ID, periodLabel, channel, spend, outcomeMetric, outcomeValue, addDays(now, -60 + i).toISOString());
  });
  console.log(`Seeded ${rows.length} MMM data-input rows across 2026-Q1/Q2, Search/Social/Video.`);
} else {
  console.log('Account already has MMM data inputs — leaving as-is.');
}

// ---------- 6. An Analytics Integration request (Deliverable #9), so the
// Analytics Integrations page shows a real submitted pathway instead of
// "not started". ----------
const acctRow = db.prepare('SELECT analyticsStatus FROM accounts WHERE accountId = ?').get(ACCOUNT_ID);
if (!acctRow.analyticsStatus || acctRow.analyticsStatus === 'not_started'){
  db.prepare(`UPDATE accounts SET
      analyticsPathway = ?, analyticsStatus = ?,
      analyticsSnowflakeAccountId = ?, analyticsSnowflakeShareName = ?, analyticsSnowflakeContact = ?,
      analyticsRequestedAt = ?
    WHERE accountId = ?`)
    .run('snowflake', 'requested',
      'atlas-voyages-prod', 'VERILUME_SHARE_ATLAS', 'data-team@atlasoceanvoyages.com (demo contact)',
      addDays(now, -6).toISOString(), ACCOUNT_ID);
  console.log('Seeded an Analytics Integration request (Snowflake pathway, status: requested).');
} else {
  console.log('Account already has an Analytics Integration request on file — leaving as-is.');
}

console.log(`\nDone. Load portal.html?accountId=${ACCOUNT_ID} against the running backend, log in with access code ${DEMO_ACCESS_CODE} (if this was the first claim), and every module below should show real content:`);
console.log('  Dashboard (Daily Brief, Analytics Summary, Campaigns), Campaign QA & Creative Messaging Collections, Team & Org Chart,');
console.log('  Analytics Integrations (+ MMM data inputs), and — on account.html — Financial Tracking.');
