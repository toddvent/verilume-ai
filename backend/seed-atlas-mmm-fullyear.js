/*
  CXMedia.AI — Atlas Ocean Voyages demo, MMM full-year seed (added 2026-07-29,
  round 88), per direct instruction: seed the demo account's MMM module with
  a trailing 12 months of real logged Spend/Reach/Impressions across all 18
  categories, using a $12,000,000 annual budget ($1,000,000/month) allocated
  across categories per common travel/hospitality media-mix best practices,
  with Internal Email and PR run at $0 spend (both are owned/earned channels
  in this account's real mix, not paid) per direct instruction.

  This replaces seed-atlas-demo-extras.js's earlier, now-superseded MMM rows
  (6 rows tagged 'Search'/'Social'/'Video' across '2026-Q1'/'2026-Q2' — free-
  text channel names that predate round 85's fixed 18-category taxonomy and
  don't match any of it) with a complete, taxonomy-correct year of monthly
  data, and saves the account's category inclusions as all 18 categories so
  the Step 4 "analysis readiness & recommended testing" panel (round 87) has
  real data to compute against out of the box.

  Budget allocation (of the $1,000,000 monthly total; this build's own
  editorial best-practice split for a national cruise-line account, not a
  sourced third-party benchmark — flagged as such since it's illustrative
  demo seed data, same convention as the rest of this account's illustrative
  content per README-DEMO.md):
    Direct Mail — Prospects     15%  ($150,000/mo)
    Direct Mail — Past Guests   10%  ($100,000/mo)
    Direct Mail — Inquiries      5%  ($50,000/mo)
    Linear TV                   10%  ($100,000/mo)
    OTV                          8%  ($80,000/mo)
    CTV                          7%  ($70,000/mo)
    Paid Social                 10%  ($100,000/mo)
    Brand Search                 8%  ($80,000/mo)
    Non-Brand Search              7%  ($70,000/mo)
    Programmatic Display         6%  ($60,000/mo)
    Partner Media                 5%  ($50,000/mo)
    Magazines                     3%  ($30,000/mo)
    Newspapers                    2%  ($20,000/mo)
    Out-of-Home                   2%  ($20,000/mo)
    Radio                         1%  ($10,000/mo)
    Podcasts                      1%  ($10,000/mo)
    Internal Email                0%  ($0/mo — owned house list)
    PR                            0%  ($0/mo — earned coverage)
  Sums to exactly 100% / $1,000,000/month / $12,000,000/year.

  Reach/Impressions per category are derived from illustrative CPM (or
  cost-per-piece, for Direct Mail) and average-frequency assumptions —
  clearly demo-illustrative estimates, not sourced real media-buy
  benchmarks, same as the rest of this seed data. Internal Email and PR get
  non-zero Reach/Impressions despite $0 spend, because both are still real
  owned/earned channels that reach a real audience even with no paid media
  behind them this account's data-entry rules require Reach/Impressions on
  every logged row regardless of Spend.

  Spend is deliberately flat month-to-month (steady pacing, no seasonal
  variation) — this is a demo of the *readiness readout*, not an invented
  seasonality pattern this build has no real basis for. That flat spend is
  itself a realistic, honestly-flagged input: the Step 4 panel will
  correctly show every paid category as "Limited spend variation" (spend
  never moves, so MMM can't isolate its effect) and both Internal Email and
  PR as "Zero spend every period" — a true, useful readout of this
  account's real logged shape, not a flaw in the demo.

  Idempotent-ish, same convention as the other seed scripts: clears only the
  specific superseded legacy MMM rows it's replacing, then checks for its
  own prior work before re-inserting.

  Usage: node backend/seed-atlas-mmm-fullyear.js
*/

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'cxmedia.db');
const db = new DatabaseSync(DB_PATH);

const ACCOUNT_ID = 'CXM-NAT-2026-700';

function genId(prefix){
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

const account = db.prepare('SELECT accountId FROM accounts WHERE accountId = ?').get(ACCOUNT_ID);
if (!account){
  console.error(`Account ${ACCOUNT_ID} not found — run seed-atlas-demo.js first.`);
  process.exit(1);
}

// ---------- 1. Remove the pre-round-85 legacy MMM rows this script
// supersedes (free-text 'Search'/'Social'/'Video' channels, quarterly
// periods) — they predate the fixed 18-category taxonomy and would
// otherwise sit alongside the new monthly data using channel names the
// taxonomy doesn't recognize. ----------
const legacyChannels = ['Search', 'Social', 'Video'];
const delStmt = db.prepare(`DELETE FROM mmm_inputs WHERE accountId = ? AND channel IN (${legacyChannels.map(() => '?').join(',')})`);
const deleted = delStmt.run(ACCOUNT_ID, ...legacyChannels);
if (deleted.changes) console.log(`Removed ${deleted.changes} legacy pre-taxonomy MMM rows (Search/Social/Video).`);

// ---------- 2. The fixed 18-category taxonomy + monthly budget allocation.
// Must match MMM_CATEGORIES in server.js exactly. ----------
const ALLOCATION = [
  ['Direct Mail — Prospects', 150000],
  ['Direct Mail — Past Guests', 100000],
  ['Direct Mail — Inquiries', 50000],
  ['Linear TV', 100000],
  ['OTV', 80000],
  ['CTV', 70000],
  ['Paid Social', 100000],
  ['Brand Search', 80000],
  ['Non-Brand Search', 70000],
  ['Programmatic Display', 60000],
  ['Partner Media', 50000],
  ['Magazines', 30000],
  ['Newspapers', 20000],
  ['Out-of-Home', 20000],
  ['Radio', 10000],
  ['Podcasts', 10000],
  ['Internal Email', 0],
  ['PR', 0]
];
const totalMonthly = ALLOCATION.reduce((s, [, v]) => s + v, 0);
if (totalMonthly !== 1000000){
  console.error(`Allocation sums to $${totalMonthly}/month, not $1,000,000 — fix ALLOCATION before seeding.`);
  process.exit(1);
}

// Illustrative Reach/Impressions model per category — demo-illustrative
// CPM/cost-per-piece + average-frequency assumptions, not sourced
// benchmarks. Direct Mail uses cost-per-piece (reach = pieces mailed,
// frequency ~1); paid media channels use CPM (impressions = spend / CPM *
// 1000, reach = impressions / average frequency); Internal Email and PR
// get fixed owned/earned reach+impressions independent of the $0 spend.
function reachImpressionsFor(category, monthlySpend){
  const CPP = { // cost per direct-mail piece
    'Direct Mail — Prospects': 0.75,
    'Direct Mail — Past Guests': 0.75,
    'Direct Mail — Inquiries': 0.75
  };
  const CPM_FREQ = { // [CPM, average frequency]
    'Linear TV': [20, 4],
    'OTV': [25, 4],
    'CTV': [30, 4],
    'Paid Social': [8, 5],
    'Brand Search': [5, 6],
    'Non-Brand Search': [4, 6],
    'Programmatic Display': [3, 5],
    'Partner Media': [10, 4],
    'Magazines': [25, 1.5],
    'Newspapers': [20, 1.5],
    'Out-of-Home': [4, 10],
    'Radio': [8, 6],
    'Podcasts': [18, 3]
  };
  if (CPP[category] != null){
    const pieces = Math.round(monthlySpend / CPP[category]);
    return { reach: pieces, impressions: pieces };
  }
  if (CPM_FREQ[category] != null){
    const [cpm, freq] = CPM_FREQ[category];
    const impressions = Math.round((monthlySpend / cpm) * 1000);
    const reach = Math.round(impressions / freq);
    return { reach, impressions };
  }
  if (category === 'Internal Email'){
    // Owned house list — reach is the list itself; impressions are opens
    // across ~4 sends/month at a ~28% open rate.
    return { reach: 45000, impressions: 50400 };
  }
  if (category === 'PR'){
    // Earned coverage — estimated unique audience reach and total
    // estimated media impressions across the month's placements.
    return { reach: 150000, impressions: 240000 };
  }
  throw new Error(`No reach/impressions model for category: ${category}`);
}

// ---------- 3. Twelve trailing months of data, one row per category per
// month, all at the flat monthly allocation above. ----------
const PERIODS = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];

const existingFullYear = db.prepare(
  "SELECT COUNT(*) AS n FROM mmm_inputs WHERE accountId = ? AND periodLabel = '2026-06' AND channel = 'Direct Mail — Prospects'"
).get(ACCOUNT_ID);

if (!existingFullYear.n){
  const insert = db.prepare(`INSERT INTO mmm_inputs (id, accountId, periodLabel, channel, spend, reach, impressions, outcomeMetric, outcomeValue, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const nowIso = new Date('2026-07-01T00:00:00.000Z').toISOString();
  let rowCount = 0;
  PERIODS.forEach(periodLabel => {
    ALLOCATION.forEach(([category, spend]) => {
      const { reach, impressions } = reachImpressionsFor(category, spend);
      insert.run(genId('MMI'), ACCOUNT_ID, periodLabel, category, spend, reach, impressions, null, null, nowIso);
      rowCount++;
    });
  });
  console.log(`Seeded ${rowCount} MMM data-input rows (${PERIODS.length} months × ${ALLOCATION.length} categories).`);
} else {
  console.log('Full-year MMM rows already present for 2026-06 — leaving mmm_inputs as-is.');
}

// ---------- 4. Save all 18 categories as this account's inclusions, so
// Step 1/2/4 of the MMM card all reflect a fully-configured account rather
// than the honest-empty "no categories selected yet" state. ----------
const allCategories = ALLOCATION.map(([category]) => category);
db.prepare('UPDATE accounts SET mmmIncludedCategoriesJson = ? WHERE accountId = ?')
  .run(JSON.stringify(allCategories), ACCOUNT_ID);
console.log(`Saved all ${allCategories.length} categories as this account's MMM inclusions.`);

console.log('Done.');
