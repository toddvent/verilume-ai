// Round 132dd (2026-08-10), per direct report: "we need to update the
// Performance Marketing and Channel step alignment. No changes exist in
// the DEMO." Diagnosis: the round 132aa Performance Marketing asset-
// selection rework is real, live code — but this baseline snapshot has
// zero creative_jobs and no channel_planning_details table at all (it
// predates round 102, same root cause as the earlier account_taxonomies
// gap fixed in round 132w's follow-on). With nothing to select, the new
// "Select assets for this campaign" section on Performance Marketing
// correctly, honestly renders "No creative jobs requested for this
// campaign yet" for every campaign — which reads as "nothing changed"
// even though the feature itself works. channel_planning_details itself
// self-heals (CREATE TABLE IF NOT EXISTS runs unconditionally at server
// startup) — the real gap is seed DATA, not schema.
//
// This seeds real Channel Planning Detail rows + matching Creative Jobs
// for 3 real, already-seeded campaigns on this account, using each
// campaign's own real `channels` field so the Performance Marketing
// picker's plan cross-reference (channel_planning_details.channel vs.
// creative_jobs.channel) actually matches on first load — not placeholder
// data, real rows a demo user can immediately select and approve.
// Idempotent — skips a campaign if it already has channel_planning_details
// rows on file.

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'cxmedia.baseline.db');
const db = new DatabaseSync(DB_PATH);

// Same table this build already creates unconditionally at server startup
// — ensures this script works even if run before the server ever has.
db.exec(`
  CREATE TABLE IF NOT EXISTS channel_planning_details (
    id TEXT PRIMARY KEY, campaignId TEXT NOT NULL, allocationId TEXT, channel TEXT NOT NULL,
    partner TEXT, audience TEXT, buyType TEXT, mediaType TEXT, impressions REAL,
    dropDate TEXT, hitDate TEXT, endDate TEXT, productYear TEXT, productGroup TEXT,
    creativeMarket TEXT, budget REAL, detailsJson TEXT, status TEXT DEFAULT 'draft',
    enteredByRole TEXT, enteredByName TEXT, lastEditedByRole TEXT, lastEditedByName TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
`);

const ACCOUNT_ID = 'CXM-NAT-2026-700';
const NOW = new Date().toISOString();

// Three real, already-seeded campaigns on this account (verified against
// the baseline directly), covering three different real channel pairs.
const TARGETS = [
  {
    campaignId: 'CMP-ms5zqqcl-767-4111', // Amazon Voyage Awareness Push — OTV, Paid Social — In Market
    rows: [
      { channel: 'OTV', partner: 'Amazon DSP', buyType: 'CPM', audience: 'PG', mediaType: 'OTV', productGroup: 'EXTRAORDINARY', creativeMarket: 'SOUTH AMERICA', budget: 42000 },
      { channel: 'Paid Social', partner: 'Meta', buyType: 'CPM', audience: 'PG', mediaType: 'SOCIAL', productGroup: 'EXTRAORDINARY', creativeMarket: 'SOUTH AMERICA', budget: 18000 }
    ],
    jobs: [
      { channel: 'OTV', deliveryPlatform: 'Amazon DSP', specSummary: '30-second pre-roll — Amazon Voyage awareness' },
      { channel: 'Paid Social', deliveryPlatform: 'Meta', specSummary: 'Feed + Story set — Amazon Voyage awareness' }
    ]
  },
  {
    campaignId: 'CMP-ms5zqqdd-468-7384', // Arctic Expedition Early-Booking Push — Brand Search, Programmatic Display
    rows: [
      { channel: 'Brand Search', partner: 'Google Ads', buyType: 'CPC', audience: 'INQ', mediaType: 'SEARCH', productGroup: 'POLAR', creativeMarket: 'ARCTIC', budget: 15000 },
      { channel: 'Programmatic Display', partner: 'The Trade Desk', buyType: 'CPM', audience: 'INQ', mediaType: 'DISPLAY IAB', productGroup: 'POLAR', creativeMarket: 'ARCTIC', budget: 22000 }
    ],
    jobs: [
      { channel: 'Brand Search', deliveryPlatform: 'Google Ads', specSummary: 'Search ad copy set — Arctic Expedition early booking' },
      { channel: 'Programmatic Display', deliveryPlatform: 'The Trade Desk', specSummary: 'IAB standard display set — Arctic Expedition early booking' }
    ]
  },
  {
    campaignId: 'CMP-ms5zqqdo-734-2155', // World Navigator Guest Referral Drive — Partner Media, Paid Social
    rows: [
      { channel: 'Partner Media', partner: 'AAA Travel', buyType: 'SPONSOR', audience: 'CX', mediaType: 'SPONSOR', productGroup: 'MULTI-PRODUCT', creativeMarket: 'BRAND', budget: 12000 },
      { channel: 'Paid Social', partner: 'Meta', buyType: 'CPM', audience: 'CX', mediaType: 'SOCIAL', productGroup: 'MULTI-PRODUCT', creativeMarket: 'BRAND', budget: 9000 }
    ],
    jobs: [
      { channel: 'Partner Media', deliveryPlatform: 'AAA Travel', specSummary: 'Co-branded referral placement — World Navigator' },
      { channel: 'Paid Social', deliveryPlatform: 'Meta', specSummary: 'Referral-drive carousel set — World Navigator' }
    ]
  }
];

const insertPlanRow = db.prepare(`INSERT INTO channel_planning_details
  (id, campaignId, allocationId, channel, partner, audience, buyType, mediaType, impressions,
   dropDate, hitDate, endDate, productYear, productGroup, creativeMarket, budget, detailsJson,
   status, enteredByRole, enteredByName, lastEditedByRole, lastEditedByName, createdAt, updatedAt)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const insertJob = db.prepare(`INSERT INTO creative_jobs
  (id, accountId, campaignId, channel, deliveryPlatform, sizeOrLength, aspect, specSummary,
   specsJson, priority, status, requestedBy, notes, createdAt, updatedAt)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

let seededCampaigns = 0, seededRows = 0, seededJobs = 0;
TARGETS.forEach((t, ti) => {
  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ? AND accountId = ?').get(t.campaignId, ACCOUNT_ID);
  if (!campaign){ console.log(`Skipping ${t.campaignId} — not found on this account.`); return; }
  const existing = db.prepare('SELECT COUNT(*) AS n FROM channel_planning_details WHERE campaignId = ?').get(t.campaignId);
  if (existing.n > 0){ console.log(`Skipping ${t.campaignId} — already has ${existing.n} channel_planning_details row(s).`); return; }

  t.rows.forEach((r, ri) => {
    insertPlanRow.run(
      `CPD-seed${ti}${ri}`, t.campaignId, null, r.channel, r.partner, r.audience, r.buyType, r.mediaType,
      null, null, null, null, '2026', r.productGroup, r.creativeMarket, r.budget, null,
      'approved', 'cx_ops', 'Demo Media Ops', 'cx_ops', 'Demo Media Ops', NOW, NOW
    );
    seededRows++;
  });
  t.jobs.forEach((j, ji) => {
    insertJob.run(
      `JOB-seed${ti}${ji}`, ACCOUNT_ID, t.campaignId, j.channel, j.deliveryPlatform, null, null,
      j.specSummary, null, 'Medium', 'Pending', 'Demo Performance Marketing', null, NOW, NOW
    );
    seededJobs++;
  });
  seededCampaigns++;
});

console.log(`Seeded ${seededRows} channel_planning_details rows and ${seededJobs} creative_jobs across ${seededCampaigns} campaign(s).`);
