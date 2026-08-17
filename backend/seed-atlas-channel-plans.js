/*
  CXMedia.AI — Round 102: Channel Planning Extended Fields, Taxonomy, and
  Marketing Calendar demo data, per
  cxmedia-round102-channel-planning-extended-fields-marketing-calendar.md.

  Loads Todd's real AOV (Atlas Ocean Voyages) planning workbook,
  MEDIA_PLANS_2H2026.xlsx, into the existing Atlas demo account
  (CXM-NAT-2026-700, access code ATLAS-DEMO1 — see seed-atlas-demo.js/
  seed-atlas-demo-extras.js, which this script extends rather than
  replaces): the account_taxonomies rows the doc's Section 3 calls for, and
  one channel_planning_details row (doc Section 1) per non-empty data row
  across the workbook's Direct Mail, Consumer Ads, Trade, Email, and Sheet1
  (real Digital) tabs.

  Parsing the .xlsx itself happens in xlsx_read.py (openpyxl) — this
  sandbox's npm registry is blocked (see server.js's own header comment;
  same reason xlsx_gen.py/qr_gen.py exist), so there is no exceljs/xlsx/
  node-xlsx to require() here. This script spawns that helper once, gets
  plain JSON back, and does every mapping/business-logic/DB decision itself
  in JS — Python's job stays limited to "workbook -> JSON".

  Campaign matching: the source data's PROJECT NUMBER is the natural join
  key (it recurs across sheets for the same underlying project), but the
  existing campaigns schema has no projectNumber column and no campaign
  seeded so far in this account carries one — so every PROJECT NUMBER in
  this workbook is new. Rather than 1,318 one-row campaigns (unusable), one
  campaign is created per unique PROJECT NUMBER (89 of them), named/keyed
  descriptively from that project's channel + Product Group + Creative
  Market, with the project number kept in the objective text as a stable
  "(Project #NNNN)" tag this script re-parses on every run to find and reuse
  the same campaign rather than duplicating it — see findOrCreateCampaign().

  allocationId matching: only attempted when a row's MARKETING GROUP string
  matches a media_plan_allocations.channel value for this account exactly
  (case-insensitive) — anything else (e.g. undifferentiated "Direct Mail" vs
  this account's segmented "Direct Mail — Prospects/Past Guests/Inquiries"
  allocations) is left null rather than guessed, per direct instruction.

  Idempotent: every channel_planning_details row this script writes is
  stamped enteredByName = 'Marketing Ops Seed Import'. Two clean passes:
  (1) parse the whole workbook and find-or-create every project's campaign
  first, (2) delete each touched campaign's prior seed-stamped rows, then
  insert the freshly parsed rows — so re-running never duplicates rows and
  never touches a campaign this script doesn't own.

  Usage: node backend/seed-atlas-channel-plans.js
*/

const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'cxmedia.db');
const db = new DatabaseSync(DB_PATH);

const ACCOUNT_ID = 'CXM-NAT-2026-700';
const XLSX_PATH = '/root/.claude/uploads/96ddc37a-d488-5991-bc75-36d3a2130e21/8da18972-MEDIA_PLANS_2H2026.xlsx';
const SEED_STAMP = 'Marketing Ops Seed Import';

function genId(prefix){
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 9000 + 1000)}`;
}
const now = new Date().toISOString();

const account = db.prepare('SELECT accountId FROM accounts WHERE accountId = ?').get(ACCOUNT_ID);
if (!account){
  console.error(`Account ${ACCOUNT_ID} not found — run seed-atlas-demo.js first.`);
  process.exit(1);
}

// ---------- 0. Read the workbook via xlsx_read.py ----------
const SHEETS = ['LOOKUPS', 'DIRECT MAIL', 'CONSUMER ADS', 'TRADE', 'EMAIL', 'Sheet1'];
let parsed;
try {
  const out = execFileSync('python3', [path.join(__dirname, 'xlsx_read.py'), XLSX_PATH, ...SHEETS], { maxBuffer: 64 * 1024 * 1024 });
  parsed = JSON.parse(out.toString('utf8'));
} catch (e){
  console.error('Failed to parse MEDIA_PLANS_2H2026.xlsx via xlsx_read.py:', e.message);
  process.exit(1);
}

function nonBlank(v){ return v !== null && v !== undefined && String(v).trim() !== ''; }
function numOrNull(v){ return typeof v === 'number' ? v : (nonBlank(v) && !isNaN(Number(v)) ? Number(v) : null); }
// Several hundred rows in this workbook are unfilled template rows carrying
// only the sheet's channel label (col A) plus leftover literal placeholder
// text in otherwise-empty cells — e.g. a Product Group cell whose value is
// literally the string "PRODUCT GROUP" (the column's own header text, not a
// real value someone entered). strOrNull() treats those as blank so they
// don't get imported as if "PRODUCT GROUP" were an actual product group.
const PLACEHOLDER_TOKENS = new Set([
  'MARKETING GROUP', 'PARTNER', 'AUDIENCE', 'PRODUCT YEAR', 'PRODUCT GROUP', 'CREATIVE MARKET',
  'BUY TYPE', 'MEDIA TYPE', 'FORMAT', 'ISSUE', 'SIZE', 'SPECS', 'VENDOR', 'CHANNEL', 'CREATIVE',
  'CREATIVE CATEGORY', 'OFFER', 'SHIP CLASS'
]);
function strOrNull(v){
  if (!nonBlank(v)) return null;
  const s = String(v).trim();
  return PLACEHOLDER_TOKENS.has(s.toUpperCase()) ? null : s;
}
function titleCase(s){ return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

// ---------- 1. account_taxonomies — LOOKUPS sheet -> one row per the 5
// account-configurable taxonomy keys the doc's Section 3 asks for. Values
// kept exactly as they appear in the source column (this is AOV's live
// vocabulary, not a normalized/re-cased copy of it). ----------
const LOOKUP_COLS = {
  productGroup: 'PRODUCT GROUP',
  creativeMarket: 'CREATIVE MARKET',
  audience: 'AUDIENCE',
  buyType: 'BUY TYPE',
  mediaType: 'MEDIA TYPE'
};
const LOOKUP_LABELS = {
  productGroup: 'Product Group',
  creativeMarket: 'Creative Market',
  audience: 'Audience',
  buyType: 'Buy Type',
  mediaType: 'Media Type'
};
const lookupsSheet = parsed['LOOKUPS'];
const lookupsHeaders = lookupsSheet.headers;
let taxonomiesWritten = 0;
const taxonomySummary = [];
Object.entries(LOOKUP_COLS).forEach(([taxonomyKey, colName]) => {
  const colIdx = lookupsHeaders.indexOf(colName);
  if (colIdx === -1){
    console.error(`LOOKUPS sheet has no "${colName}" column — skipping ${taxonomyKey}.`);
    return;
  }
  const values = [];
  lookupsSheet.rows.forEach(row => {
    const v = strOrNull(row[colIdx]);
    if (v && !values.includes(v)) values.push(v);
  });
  const existing = db.prepare('SELECT id FROM account_taxonomies WHERE accountId = ? AND taxonomyKey = ?').get(ACCOUNT_ID, taxonomyKey);
  if (existing){
    db.prepare('UPDATE account_taxonomies SET label = ?, valuesJson = ?, updatedAt = ? WHERE id = ?')
      .run(LOOKUP_LABELS[taxonomyKey], JSON.stringify(values), now, existing.id);
  } else {
    db.prepare('INSERT INTO account_taxonomies (id, accountId, taxonomyKey, label, valuesJson, updatedAt) VALUES (?,?,?,?,?,?)')
      .run(genId('TAX'), ACCOUNT_ID, taxonomyKey, LOOKUP_LABELS[taxonomyKey], JSON.stringify(values), now);
  }
  taxonomiesWritten++;
  taxonomySummary.push(`  ${taxonomyKey}: ${values.length} values`);
});

// ---------- 2. allocationId matching map — exact (case-insensitive)
// channel-name match against this account's media_plan_allocations only. ----------
const allocRows = db.prepare(`
  SELECT ma.id, ma.channel FROM media_plan_allocations ma
  JOIN media_plans mp ON mp.id = ma.mediaPlanId
  WHERE mp.accountId = ?
`).all(ACCOUNT_ID);
const allocByChannelLower = {};
allocRows.forEach(a => {
  const key = a.channel.trim().toLowerCase();
  // Ambiguous (two allocations share a channel name, e.g. across stages) —
  // leave unmatched rather than guess which one.
  allocByChannelLower[key] = allocByChannelLower[key] === undefined ? a.id : null;
});
function matchAllocationId(channel){
  if (!channel) return null;
  const id = allocByChannelLower[channel.trim().toLowerCase()];
  return id || null;
}

// ---------- 3. Channel-specific row mappers ----------
function idxOf(headers){
  return headers.reduce((m, h, i) => { m[h] = i; return m; }, {});
}
function get(row, idx, key){
  const i = idx[key];
  return i === undefined || i === -1 ? null : row[i];
}

function mapDirectMail(row, idx){
  return {
    channel: strOrNull(get(row, idx, 'MARKETING GROUP')),
    projectNumber: get(row, idx, 'PROJECT NUMBER'),
    partner: strOrNull(get(row, idx, 'PARTNER')),
    budget: numOrNull(get(row, idx, 'BUDGET')),
    dropDate: strOrNull(get(row, idx, 'DROP DATE')),
    hitDate: strOrNull(get(row, idx, 'HIT DATE')),
    endDate: strOrNull(get(row, idx, 'END DATE (Calc)')),
    audience: strOrNull(get(row, idx, 'AUDIENCE')),
    productYear: strOrNull(get(row, idx, 'PRODUCT YEAR')),
    productGroup: strOrNull(get(row, idx, 'PRODUCT GROUP')),
    creativeMarket: strOrNull(get(row, idx, 'CREATIVE MARKET')),
    buyType: strOrNull(get(row, idx, 'BUY TYPE')),
    mediaType: strOrNull(get(row, idx, 'MEDIA TYPE')),
    impressions: numOrNull(get(row, idx, 'IMPRESSIONS')),
    detailsJson: {
      format: strOrNull(get(row, idx, 'FORMAT')),
      totalQty: numOrNull(get(row, idx, 'TOTAL QTY')),
      mailQty: numOrNull(get(row, idx, 'MAIL QTY')),
      salesFulfill: strOrNull(get(row, idx, 'SALES FULFILL')),
      paperOrdered: strOrNull(get(row, idx, 'PAPER ORDERED')),
      paperMfgCost: numOrNull(get(row, idx, 'PAPER and MANUFACTURINGCOST')),
      postageCost: numOrNull(get(row, idx, 'POSTAGE or FREIGHT')),
      insertionCost: numOrNull(get(row, idx, 'INSERTION')),
      totalCost: numOrNull(get(row, idx, 'COST')),
      unitCost: numOrNull(get(row, idx, 'UNIT COST')),
      vendor: strOrNull(get(row, idx, 'Vendor')),
      listDueDate: strOrNull(get(row, idx, 'LIST DUE')),
      listRequestDate: strOrNull(get(row, idx, 'LIST REQUEST ')),
      expeditionsPromoted: strOrNull(get(row, idx, 'EXPEDITIONS PROMOTED')),
      notes: strOrNull(get(row, idx, 'NOTES'))
    }
  };
}

// Consumer Ads / Trade (Print — shared shape; TRADE has fewer columns but
// the same names for the ones it does have).
function mapPrint(row, idx){
  return {
    channel: strOrNull(get(row, idx, 'MARKETING GROUP')),
    projectNumber: get(row, idx, 'PROJECT NUMBER'),
    partner: strOrNull(get(row, idx, 'PARTNER')),
    budget: numOrNull(get(row, idx, 'BUDGET')),
    dropDate: strOrNull(get(row, idx, 'DROP DATE')),
    hitDate: strOrNull(get(row, idx, 'HIT DATE')),
    endDate: strOrNull(get(row, idx, 'END DATE')),
    audience: strOrNull(get(row, idx, 'AUDIENCE')),
    productYear: strOrNull(get(row, idx, 'PRODUCT YEAR') ?? get(row, idx, 'PRODUCT YEAR (sail year)')),
    productGroup: strOrNull(get(row, idx, 'PRODUCT GROUP')),
    creativeMarket: strOrNull(get(row, idx, 'CREATIVE MARKET')),
    buyType: strOrNull(get(row, idx, 'BUY TYPE')),
    mediaType: strOrNull(get(row, idx, 'MEDIA TYPE')),
    impressions: numOrNull(get(row, idx, 'IMPRESSIONS') ?? get(row, idx, 'IMPRESSIONS|REACH')),
    detailsJson: {
      issue: strOrNull(get(row, idx, 'ISSUE')),
      size: strOrNull(get(row, idx, 'SIZE')),
      specs: strOrNull(get(row, idx, 'SPECS')),
      creativeDueDate: strOrNull(get(row, idx, 'CREATIVE DUE')),
      proofDueDate: strOrNull(get(row, idx, '1ST PROOF DUE')),
      qrLink: strOrNull(get(row, idx, 'QR CODE LINK')),
      phone: strOrNull(get(row, idx, 'PHONE')),
      expeditionsPromoted: strOrNull(get(row, idx, 'EXPEDITIONS PROMOTED')),
      notes: strOrNull(get(row, idx, 'NOTES'))
    }
  };
}

// Email — shared core only, per the scoping doc (no channel-specific
// sub-fields called out beyond Product Year/Reach, both already in the
// shared core).
function mapEmail(row, idx){
  return {
    channel: strOrNull(get(row, idx, 'MARKETING GROUP')),
    projectNumber: get(row, idx, 'PROJECT NUMBER'),
    partner: strOrNull(get(row, idx, 'PARTNER')),
    budget: numOrNull(get(row, idx, 'BUDGET')),
    dropDate: strOrNull(get(row, idx, 'DROP DATE')),
    hitDate: strOrNull(get(row, idx, 'HIT DATE')),
    endDate: strOrNull(get(row, idx, 'END DATE')),
    audience: strOrNull(get(row, idx, 'AUDIENCE')),
    productYear: strOrNull(get(row, idx, 'PRODUCT YEAR (sail year)')),
    productGroup: strOrNull(get(row, idx, 'PRODUCT GROUP')),
    creativeMarket: strOrNull(get(row, idx, 'CREATIVE MARKET')),
    buyType: strOrNull(get(row, idx, 'BUY TYPE')),
    mediaType: strOrNull(get(row, idx, 'MEDIA TYPE')),
    impressions: numOrNull(get(row, idx, 'IMPRESSIONS|REACH')),
    detailsJson: {}
  };
}

// Sheet1 — the real Digital tab. No explicit CREATIVE MARKET column; per
// direct inspection of the data, REGIONS PROMOTED carries exactly the same
// vocabulary as every other sheet's Creative Market column (e.g.
// "N. EUROPE"), so it's mapped there rather than left in detailsJson only.
// Similarly CREATIVE holds Media Type vocabulary values (e.g. "DISPLAY
// IAB") in this sheet, so it's mapped to mediaType (and kept in detailsJson
// too, for traceability back to the source column name).
function mapDigital(row, idx){
  return {
    channel: strOrNull(get(row, idx, 'CHANNEL')),
    projectNumber: get(row, idx, 'PROJECT #'),
    partner: strOrNull(get(row, idx, 'PARTNER')),
    budget: numOrNull(get(row, idx, 'BUDGET')),
    dropDate: null,
    hitDate: strOrNull(get(row, idx, 'HIT DATE')),
    endDate: null,
    audience: strOrNull(get(row, idx, 'AUDIENCE')),
    productYear: strOrNull(get(row, idx, 'YEAR')),
    productGroup: strOrNull(get(row, idx, 'PRODUCT GROUP')),
    creativeMarket: strOrNull(get(row, idx, 'REGIONS PROMOTED')),
    buyType: strOrNull(get(row, idx, 'BUY TYPE')),
    mediaType: strOrNull(get(row, idx, 'CREATIVE')),
    impressions: numOrNull(get(row, idx, 'REACH | CLICKS')),
    detailsJson: {
      creative: strOrNull(get(row, idx, 'CREATIVE')),
      creativeCategory: strOrNull(get(row, idx, 'CREATIVE CATEGORY')),
      regionsPromoted: strOrNull(get(row, idx, 'REGIONS PROMOTED')),
      runDates: strOrNull(get(row, idx, 'Run Dates')),
      offer: strOrNull(get(row, idx, 'Offer')),
      shipClass: strOrNull(get(row, idx, 'SHIP CLASS')),
      campaignWeeks: numOrNull(get(row, idx, 'CAMPAIGN WEEKS')),
      reachPerWeek: numOrNull(get(row, idx, 'REACH  PER WEEK')),
      delivered: strOrNull(get(row, idx, 'Delivered')),
      expeditionsPromoted: strOrNull(get(row, idx, 'Expeditions Promoted')),
      notes: strOrNull(get(row, idx, 'Notes'))
    }
  };
}

const SHEET_CONFIG = [
  { name: 'DIRECT MAIL', mapper: mapDirectMail },
  { name: 'CONSUMER ADS', mapper: mapPrint },
  { name: 'TRADE', mapper: mapPrint },
  { name: 'EMAIL', mapper: mapEmail },
  { name: 'Sheet1', mapper: mapDigital }
];

// ---------- 4. Pass 1 — parse every sheet into mapped rows, grouped by a
// stable per-row campaign key (PROJECT NUMBER, or a per-sheet fallback for
// the rare blank one so it still lands somewhere rather than being
// dropped). ----------
const rowCounts = {};
const allMappedRows = []; // { sheetName, campaignKey, data }
SHEET_CONFIG.forEach(({ name, mapper }) => {
  const sheet = parsed[name];
  if (!sheet){
    console.error(`Sheet "${name}" missing from parsed workbook — skipping.`);
    return;
  }
  const idx = idxOf(sheet.headers);
  let count = 0;
  sheet.rows.forEach(row => {
    if (!nonBlank(row[0])) return; // blank leading cell = not a real data row
    const mapped = mapper(row, idx);
    if (!mapped.channel) return;
    const campaignKey = nonBlank(mapped.projectNumber) ? String(mapped.projectNumber).trim() : `NOPROJ-${name.replace(/\s+/g, '_')}`;
    allMappedRows.push({ sheetName: name, campaignKey, data: mapped });
    count++;
  });
  rowCounts[name] = count;
});

// ---------- 5. Find-or-create one campaign per campaignKey, keyed off a
// stable "(Project #NNNN)" tag in the objective text so a re-run finds the
// same campaign instead of creating a duplicate. ----------
// Non-greedy but anchored to end-of-string, not \S+ — some fallback keys
// (NOPROJ-DIRECT_MAIL etc.) could in principle contain characters \S+ would
// mishandle; anchoring to the literal ")" at the very end of objective is
// unambiguous since the tag is always appended last.
const PROJECT_TAG_RE = /\(Project #(.+)\)$/;
const existingCampaigns = db.prepare('SELECT id, objective FROM campaigns WHERE accountId = ?').all(ACCOUNT_ID);
const campaignIdByKey = {};
existingCampaigns.forEach(c => {
  const m = c.objective && c.objective.match(PROJECT_TAG_RE);
  if (m) campaignIdByKey[m[1]] = c.id;
});
let campaignsCreated = 0, campaignsReused = 0;

function findOrCreateCampaign(campaignKey, sample){
  if (campaignIdByKey[campaignKey]){
    campaignsReused++;
    return campaignIdByKey[campaignKey];
  }
  const channelLabel = titleCase(sample.channel || 'Marketing');
  const pgLabel = titleCase(sample.productGroup || '');
  const cmLabel = titleCase(sample.creativeMarket || '');
  const descriptor = [pgLabel, cmLabel].filter(Boolean).join(' / ');
  const objective = `${channelLabel}${descriptor ? ' — ' + descriptor : ''} (Project #${campaignKey})`;
  const campaignId = genId('CMP');
  db.prepare(`INSERT INTO campaigns
    (id, accountId, objective, segment, stage, keyMessage, name, channels, fundingSource, status, createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    campaignId, ACCOUNT_ID, objective, sample.audience || '', '',
    `${channelLabel} plan for ${descriptor || 'Atlas Ocean Voyages'} — imported from MEDIA_PLANS_2H2026.xlsx, Project #${campaignKey}.`,
    objective, sample.channel || '', 'planned', 'In Market', now
  );
  campaignIdByKey[campaignKey] = campaignId;
  campaignsCreated++;
  return campaignId;
}

const rowsByCampaign = {}; // campaignId -> [{data}]
Object.entries(
  allMappedRows.reduce((groups, r) => {
    (groups[r.campaignKey] = groups[r.campaignKey] || []).push(r);
    return groups;
  }, {})
).forEach(([campaignKey, rows]) => {
  const campaignId = findOrCreateCampaign(campaignKey, rows[0].data);
  rowsByCampaign[campaignId] = (rowsByCampaign[campaignId] || []).concat(rows.map(r => r.data));
});

// ---------- 6. Pass 2 — clear this script's prior rows for every touched
// campaign, then insert the freshly parsed rows. ----------
const deleteSeedRowsForCampaign = db.prepare(
  `DELETE FROM channel_planning_details WHERE campaignId = ? AND enteredByName = ?`
);
const insertRow = db.prepare(`INSERT INTO channel_planning_details
  (id, campaignId, allocationId, channel, partner, audience, buyType, mediaType, impressions,
   dropDate, hitDate, endDate, productYear, productGroup, creativeMarket, budget, detailsJson,
   status, enteredByRole, enteredByName, lastEditedByRole, lastEditedByName, createdAt, updatedAt)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

let totalDetailRows = 0;
Object.entries(rowsByCampaign).forEach(([campaignId, rows]) => {
  deleteSeedRowsForCampaign.run(campaignId, SEED_STAMP);
  rows.forEach(r => {
    insertRow.run(
      genId('CPD'), campaignId, matchAllocationId(r.channel), r.channel,
      r.partner, r.audience, r.buyType, r.mediaType, r.impressions,
      r.dropDate, r.hitDate, r.endDate, r.productYear, r.productGroup, r.creativeMarket, r.budget,
      JSON.stringify(r.detailsJson), 'approved',
      'cx_ops', SEED_STAMP, 'cx_ops', SEED_STAMP,
      now, now
    );
    totalDetailRows++;
  });
});

// ---------- 6b. Backfill each touched campaign's own budget/startDate/
// endDate from its channel_planning_details rows. Without this, every shell
// campaign this script creates has channels set but budget/startDate stay
// null on the campaigns table itself (that data only lived on the detail
// rows) — which reads as "incomplete" to the Marketing Ops "Campaign
// Creation & Editing" queue (renderMarketingOpsQueueStep's completeness
// check is `c.objective && c.channels && c.budget != null && c.startDate`),
// so on a first run every one of these campaigns flooded that queue's
// Active view and buried the real, non-imported campaigns. Added after
// that was caught live against a running demo. budget = sum of this
// campaign's real planning-row budgets; startDate = earliest real hitDate
// among them; endDate = latest real END DATE among them — all three
// genuine aggregates of the imported data, never fabricated. A campaign
// whose rows are all missing hitDate/budget/endDate (a handful of the
// source workbook's "NOPROJ-" fallback rows, and the Digital/Sheet1 tab,
// which carries no END DATE column at all) legitimately stays incomplete
// on that field — an accurate reflection of a gap in the source data, not
// something to paper over.
//
// Round 132bq (2026-08-13), per testing feedback ("some fields with
// calendar and due dates out of place"): endDate was missing from this
// backfill entirely — every one of these 92 campaigns showed a real
// startDate but a blank End Date in Campaign Management, even on the 689
// (of 1318) rows that DO carry a real END DATE in the source workbook. Same
// "don't show — when a real date exists one field over" convention this
// script already applies to budget/startDate, just missed for endDate.
const backfillCampaign = db.prepare('UPDATE campaigns SET budget = ?, startDate = ?, endDate = ? WHERE id = ?');
let campaignsBackfilled = 0;
Object.entries(rowsByCampaign).forEach(([campaignId, rows]) => {
  const budgets = rows.map(r => r.budget).filter(v => typeof v === 'number' && !isNaN(v));
  const hitDates = rows.map(r => r.hitDate).filter(Boolean).sort();
  const endDates = rows.map(r => r.endDate).filter(Boolean).sort();
  const budget = budgets.length ? Math.round(budgets.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  const startDate = hitDates.length ? hitDates[0] : null;
  const endDate = endDates.length ? endDates[endDates.length - 1] : null;
  if (budget !== null || startDate !== null || endDate !== null){
    backfillCampaign.run(budget, startDate, endDate, campaignId);
    campaignsBackfilled++;
  }
});

console.log('account_taxonomies written:');
console.log(taxonomySummary.join('\n'));
console.log('\nRow counts by sheet:');
Object.entries(rowCounts).forEach(([name, count]) => console.log(`  ${name}: ${count}`));
console.log(`\nTotal channel_planning_details rows written: ${totalDetailRows}`);
console.log(`Campaigns created: ${campaignsCreated}, reused: ${campaignsReused} (${campaignsCreated + campaignsReused} unique PROJECT NUMBERs/keys total).`);
console.log(`Campaigns backfilled with budget/startDate: ${campaignsBackfilled}.`);
console.log(`Taxonomies written: ${taxonomiesWritten}.`);
console.log(`\nDone. GET /api/accounts/${ACCOUNT_ID}/marketing-calendar should now return real events.`);
