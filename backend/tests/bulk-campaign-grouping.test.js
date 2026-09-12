'use strict';
// 2026-09-13 — bulk-create-campaigns grouping rewrite tests, per direct
// instruction (Todd): "They aren't grouped by campaign name... The
// grouping is based on Partner + Campaign Dates + Audience," clarified via
// a real example row (AFAR / Hit 4/20/2026 / End 12/31/2026 / PR) that
// Campaign Dates means Hit Date + End Date together (not Drop Date), then
// "Good catch. Add channel + partner, dates and audience" — final grouping
// key: Channel + Partner + Hit Date + End Date + Audience, exact match on
// all five. This replaces the old campaignName-based grouping entirely
// ("clients don't always have a name").
//
// Also covers projectNumber (client's own internal Wrike reference number,
// see the ensureColumn comment in server.js): accepted and stored on
// insert via this endpoint, returned by the row's serialized form, and
// never changed by a later PATCH to that row's actuals — even if the PATCH
// body includes a different projectNumber value.
//
// Per the endpoint's own ASSUMPTION comment (unconfirmed, safe default): a
// second upload whose row matches an EXISTING campaign's key ADDS to that
// campaign rather than replacing/deleting its prior rows.

process.env.CXMEDIA_TEST_DB_PATH = ':memory:';
process.env.PORT = '0';

const http = require('http');

let pass = 0, fail = 0;
function assert(cond, msg){
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', msg); }
}

const handleRequest = require('../server.js');
const { db, createSession } = handleRequest.testExports;

const server = http.createServer(handleRequest);

server.listen(0, async () => {
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  async function req(method, path, body, authHeaders){
    const resp = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(authHeaders || {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await resp.json(); } catch (e) {}
    return { status: resp.status, json };
  }

  const accountId = 'ACC_BULK_GROUPING_TEST';
  const now = new Date().toISOString();
  db.prepare('INSERT INTO accounts (accountId, company, industry, footprint, createdAt) VALUES (?,?,?,?,?)')
    .run(accountId, 'Bulk Grouping Test Co', 'travel', 'US', now);
  const { token } = createSession(accountId);
  const auth = { 'Authorization': `Bearer ${token}` };

  const bulkPath = `/api/accounts/${accountId}/channel-planning/bulk-create-campaigns`;

  // ================= 1) Two rows sharing the same 5-field key land in the =================
  // SAME new campaign.
  const batch1 = await req('POST', bulkPath, {
    actorRole: 'cx_ops', actorName: 'Tester', fileName: 'batch1.csv',
    rows: [
      { channel: 'Print', partner: 'AFAR', hitDate: '2026-04-20', endDate: '2026-12-31', audience: 'PR', budget: 1000, projectNumber: 'WRIKE-1001' },
      { channel: 'Print', partner: 'AFAR', hitDate: '2026-04-20', endDate: '2026-12-31', audience: 'PR', budget: 2000 }
    ]
  }, auth);
  assert(batch1.status === 200, `batch1 should 200, got ${batch1.status} ${JSON.stringify(batch1.json)}`);
  assert(batch1.json.rowsInserted === 2, `batch1 should insert 2 rows, got ${batch1.json.rowsInserted}`);
  assert(batch1.json.campaignsCreated.length === 1, `two matching rows should create exactly ONE campaign, got ${batch1.json.campaignsCreated.length}`);
  assert(batch1.json.campaignsMatched.length === 0, 'batch1 rows are all new — nothing should be matched yet');
  const sharedCampaignId = batch1.json.campaignsCreated[0];
  const row1EntryId = batch1.json.results[0].entryId;
  assert(batch1.json.results.every(r => r.campaignId === sharedCampaignId), 'both rows in batch1 should land on the same campaign id');

  // ================= 2) A different Audience (all else equal) creates a =================
  // SEPARATE campaign — proves Audience is part of the key.
  const batch2 = await req('POST', bulkPath, {
    actorRole: 'cx_ops', actorName: 'Tester', fileName: 'batch2.csv',
    rows: [
      { channel: 'Print', partner: 'AFAR', hitDate: '2026-04-20', endDate: '2026-12-31', audience: 'Prospect', budget: 500 }
    ]
  }, auth);
  assert(batch2.status === 200, 'batch2 should 200');
  assert(batch2.json.campaignsCreated.length === 1, 'a different Audience should create a NEW campaign, not match the PR one');
  assert(batch2.json.campaignsCreated[0] !== sharedCampaignId, 'the different-audience campaign must not be the same id as the shared PR campaign');

  // ================= 3) A different Channel (all else equal) creates a =================
  // SEPARATE campaign — proves Channel is part of the key.
  const batch3 = await req('POST', bulkPath, {
    actorRole: 'cx_ops', actorName: 'Tester', fileName: 'batch3.csv',
    rows: [
      { channel: 'Digital', partner: 'AFAR', hitDate: '2026-04-20', endDate: '2026-12-31', audience: 'PR', budget: 700 }
    ]
  }, auth);
  assert(batch3.status === 200, 'batch3 should 200');
  assert(batch3.json.campaignsCreated.length === 1, 'a different Channel should create a NEW campaign, not match the Print/AFAR/PR one');
  assert(batch3.json.campaignsCreated[0] !== sharedCampaignId, 'the different-channel campaign must not be the same id as the shared Print/AFAR/PR campaign');

  // ================= 4) A later upload matching an EXISTING campaign's key =================
  // ADDS to it (row count grows) rather than replacing/deleting its prior rows.
  const beforeList = await req('GET', `/api/campaigns/${sharedCampaignId}/channel-planning`, null, auth);
  assert(beforeList.json.entries.length === 2, `sanity check: shared campaign should have 2 rows before the second upload, got ${beforeList.json.entries.length}`);
  const priorEntryIds = beforeList.json.entries.map(e => e.id).sort();

  const batch4 = await req('POST', bulkPath, {
    actorRole: 'cx_ops', actorName: 'Tester', fileName: 'batch4.csv',
    rows: [
      { channel: 'Print', partner: 'AFAR', hitDate: '2026-04-20', endDate: '2026-12-31', audience: 'PR', budget: 3000 }
    ]
  }, auth);
  assert(batch4.status === 200, 'batch4 should 200');
  assert(batch4.json.campaignsMatched.length === 1 && batch4.json.campaignsMatched[0] === sharedCampaignId, 'batch4 row should MATCH the existing shared campaign, not create a new one');
  assert(batch4.json.campaignsCreated.length === 0, 'batch4 should not create any new campaign');
  assert(batch4.json.keyGroups[0].matchedExistingCampaign === true, 'keyGroups summary should report matchedExistingCampaign true for batch4');

  const afterList = await req('GET', `/api/campaigns/${sharedCampaignId}/channel-planning`, null, auth);
  assert(afterList.json.entries.length === 3, `shared campaign should now have 3 rows (2 prior + 1 added), got ${afterList.json.entries.length}`);
  const afterEntryIds = afterList.json.entries.map(e => e.id);
  priorEntryIds.forEach(id => {
    assert(afterEntryIds.includes(id), `prior row ${id} must still be present after the second upload (append, not replace)`);
  });

  // ================= 5) projectNumber: accepted/stored on insert, returned by =================
  // serialization, and NEVER changed by a PATCH — even one that includes a
  // different projectNumber value.
  const row1 = afterList.json.entries.find(e => e.id === row1EntryId);
  assert(row1 && row1.projectNumber === 'WRIKE-1001', `row1 should have persisted projectNumber WRIKE-1001, got ${row1 && row1.projectNumber}`);

  const patchResp = await req('PATCH', `/api/campaigns/${sharedCampaignId}/channel-planning/${row1EntryId}`, {
    actorRole: 'cx_ops', actorName: 'Tester',
    actualCalls: 5, actualQrScans: 10, actualUrlVisits: 3, actualLeads: 1,
    projectNumber: 'SHOULD-NOT-STICK'
  }, auth);
  assert(patchResp.status === 200, 'patch with actuals + projectNumber should still 200 (projectNumber silently ignored, not an error)');

  const afterPatchList = await req('GET', `/api/campaigns/${sharedCampaignId}/channel-planning`, null, auth);
  const row1AfterPatch = afterPatchList.json.entries.find(e => e.id === row1EntryId);
  assert(row1AfterPatch.actualCalls === 5, `actualCalls should have updated to 5, got ${row1AfterPatch.actualCalls}`);
  assert(row1AfterPatch.projectNumber === 'WRIKE-1001', `projectNumber must remain WRIKE-1001 after a PATCH that tried to change it, got ${row1AfterPatch.projectNumber}`);

  // A row that never had a projectNumber should serialize it as null, not undefined/missing.
  const row2 = afterList.json.entries.find(e => e.id !== row1EntryId && e.budget === 2000);
  assert(row2 && row2.projectNumber === null, `a row with no projectNumber should serialize as null, got ${row2 && row2.projectNumber}`);

  console.log(`# ${pass} passed, ${fail} failed`);
  server.close();
  process.exitCode = fail > 0 ? 1 : 0;
});

