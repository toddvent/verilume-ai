/*
  CXMedia.AI — Round 132c13 (2026-08-17): Atlas Ocean Voyages' real 2027
  revenue/budget targets, per direct instruction: "Atlas 2027 revenue
  target is $132 million with a 7% Marketing budget and another 2%
  dedicated to the sales/trade marketing line items."

  Creates (or updates, if already present) the CXM-NAT-2026-700 media plan
  for year 2027 with:
    grossRevenue          = 132,000,000
    marketingBudgetPct    = 7          -> totalBudget          = 9,240,000
    tradeMarketingPct     = 2          -> tradeMarketingBudget = 2,640,000
  Both dollar figures are the exact result of applying the stated
  percentages to the stated revenue (132,000,000 * 0.07 and * 0.02) —
  computed here the same way mpApplyRevenuePct() computes them on the
  frontend, not typed as separate hardcoded numbers that could drift from
  the percentages.

  Idempotent: upserts by (accountId, year) like the POST /media-plan
  endpoint does, so re-running this after a schema change or a fresh seed
  pass just re-asserts the same real numbers rather than duplicating a row.

  Usage: node backend/seed-atlas-2027-budget.js
*/
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'cxmedia.db');
const db = new DatabaseSync(DB_PATH);

const ACCOUNT_ID = 'CXM-NAT-2026-700';
const YEAR = 2027;
const GROSS_REVENUE = 132000000;
const MARKETING_BUDGET_PCT = 7;
const TRADE_MARKETING_PCT = 2;
const totalBudget = Math.round(GROSS_REVENUE * (MARKETING_BUDGET_PCT / 100));
const tradeMarketingBudget = Math.round(GROSS_REVENUE * (TRADE_MARKETING_PCT / 100));

function generateId(prefix){
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const account = db.prepare('SELECT accountId FROM accounts WHERE accountId = ?').get(ACCOUNT_ID);
if (!account){
  console.error(`Account ${ACCOUNT_ID} not found — run seed-atlas-demo.js first.`);
  process.exit(1);
}

const now = new Date().toISOString();
const existing = db.prepare('SELECT id FROM media_plans WHERE accountId = ? AND year = ? ORDER BY updatedAt DESC LIMIT 1').get(ACCOUNT_ID, YEAR);

if (existing){
  db.prepare(`
    UPDATE media_plans
    SET totalBudget = ?, grossRevenue = ?, marketingBudgetPct = ?, tradeMarketingPct = ?, tradeMarketingBudget = ?, updatedAt = ?
    WHERE id = ?
  `).run(totalBudget, GROSS_REVENUE, MARKETING_BUDGET_PCT, TRADE_MARKETING_PCT, tradeMarketingBudget, now, existing.id);
  console.log(`Updated existing ${YEAR} plan (${existing.id}) for ${ACCOUNT_ID}.`);
} else {
  const planId = generateId('PLAN');
  db.prepare(`
    INSERT INTO media_plans (id, accountId, year, totalBudget, usesTranches, trancheGranularity, grossRevenue, nonWorkingMediaJson, monthlyMode, monthlyPctJson, marketingBudgetPct, tradeMarketingPct, tradeMarketingBudget, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 0, 'quarterly', ?, '[]', 'flat', NULL, ?, ?, ?, ?, ?)
  `).run(planId, ACCOUNT_ID, YEAR, totalBudget, GROSS_REVENUE, MARKETING_BUDGET_PCT, TRADE_MARKETING_PCT, tradeMarketingBudget, now, now);
  console.log(`Created new ${YEAR} plan (${planId}) for ${ACCOUNT_ID}.`);
}

console.log(`  Gross revenue: $${GROSS_REVENUE.toLocaleString()}`);
console.log(`  Marketing budget: ${MARKETING_BUDGET_PCT}% = $${totalBudget.toLocaleString()}`);
console.log(`  Sales & Trade Marketing budget: ${TRADE_MARKETING_PCT}% = $${tradeMarketingBudget.toLocaleString()}`);
