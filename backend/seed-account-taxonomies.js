// Round 132w follow-on (2026-08-10), per direct report from testing the
// packaged demo: Campaign Creation's Product Group / Creative Focus Group
// showed "No taxonomy loaded for this account yet." This baseline snapshot
// (cxmedia.baseline.db) was frozen before round 102 (account_taxonomies /
// channel_planning_details) existed, so it has neither the table nor any
// rows — the Atlas Ocean Voyages account here has never had its real
// Product Group/Creative Market/Audience/Buy Type/Media Type lists
// configured, unlike this session's fuller working backend (backend/cxmedia.db).
//
// This seeds the exact same 5 real taxonomy rows (same accountId,
// CXM-NAT-2026-700, same real AOV Lookups-tab values) so the dropdowns
// populate. It does NOT bring over channel_planning_details or the fuller
// 92-vs-24-campaign backfill — that's the open baseline-swap question
// flagged separately; this only unblocks the taxonomy dropdowns
// themselves, which is what was actually failing in the screenshot.
// Idempotent — skips any (accountId, taxonomyKey) pair that already exists.

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'cxmedia.baseline.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS account_taxonomies (
    id TEXT PRIMARY KEY,
    accountId TEXT NOT NULL,
    taxonomyKey TEXT NOT NULL,
    label TEXT NOT NULL,
    valuesJson TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (accountId) REFERENCES accounts(accountId)
  );
`);

const ACCOUNT_ID = 'CXM-NAT-2026-700';
const NOW = '2026-08-09T10:49:51.943Z'; // matches the live working db's own seed timestamp

const ROWS = [
  { key: 'productGroup', label: 'Product Group', values: ['POLAR', 'CULTURAL', 'EPICUREAN', 'EXTRAORDINARY', 'MULTI-PRODUCT'] },
  { key: 'creativeMarket', label: 'Creative Market', values: ['AFRICA', 'ANTARCTICA', 'ARCTIC', 'ASIA', 'BRAND', 'CARIBBEAN', 'GRAND VOYAGES', 'MEDITERRANEAN', 'MULTI-DESTINATION', 'N. EUROPE', 'SOUTH AMERICA', 'AAV INAUGURAL'] },
  { key: 'audience', label: 'Audience', values: ['CX', 'FUT', 'INQ', 'OPT-OUT', 'PG', 'PR', 'TRADE', 'MULTI-AUDIENCE'] },
  { key: 'buyType', label: 'Buy Type', values: ['CPC', 'CPM', 'LIST COST | MODEL', 'PERFORMANCE', 'SPONSOR', 'VALUE ADD', 'MARTECH'] },
  { key: 'mediaType', label: 'Media Type', values: ['ANALYTICS', 'CONTENT', 'CTV', 'DISPLAY IAB', 'DM STANDARD', 'DM TRIGGER', 'EM FULL', 'EM SPONSOR', 'INFLUENCER', 'MAG AD', 'MAG INSERT', 'NEWSPAPER', 'OTV', 'SEARCH', 'SOCIAL', 'SPONSOR', 'TXT LINKS', 'NOT APPLICABLE'] }
];

const existing = db.prepare('SELECT taxonomyKey FROM account_taxonomies WHERE accountId = ?').all(ACCOUNT_ID).map(r => r.taxonomyKey);
const insert = db.prepare('INSERT INTO account_taxonomies (id, accountId, taxonomyKey, label, valuesJson, updatedAt) VALUES (?,?,?,?,?,?)');

let inserted = 0;
ROWS.forEach((row, i) => {
  if (existing.includes(row.key)){ console.log(`Skipping ${row.key} — already present.`); return; }
  insert.run(`TAX-baseline-${i}`, ACCOUNT_ID, row.key, row.label, JSON.stringify(row.values), NOW);
  inserted++;
});

console.log(`Inserted ${inserted} of ${ROWS.length} taxonomy rows for ${ACCOUNT_ID}.`);
