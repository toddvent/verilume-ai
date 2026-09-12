'use strict';
// 2026-09-13 — Publisher/Vendor Performance tests, per direct instruction:
// "the strongest direct use case is the comparative analytics
// workstream... Magazines and Newspapers: we capture cost, household
// reach, total circulation and creative size compared to other magazines
// and newspapers based on calls, QR code scans, direct URL visits and
// measurable leads. Direct Mail: same approach." Followed by: "Build it
// for direct mail also. The main difference is that we need to
// incorporate Audience (Past Customer, Inquiry, Prospect List Audience)
// to make it fair," and, on scoring: "start from base 0 and build as you
// go... Verilume can publish metrics when we become established or
// partner with someone who elevates us" — i.e. no external benchmark
// constant, every score is self-referential to this account's own data.
//
// Covers: actuals (calls/QR scans/URL visits/leads) persist as four
// separate columns via PATCH, not one blended number; the
// publisher-performance endpoint groups Magazines by publication only and
// Direct Mail by publication+audience; the score genuinely rewards a
// smaller/cheaper placement with a better response over a bigger one (the
// "not a circulation report" requirement) using both an engagement-rate
// axis (normalizes for reach) and a cost-efficiency axis (normalizes for
// spend); and the Direct Mail audience-fairness requirement — a vendor's
// only placement on one audience segment scores against that segment
// alone, never against a different, naturally hotter/colder list.

process.env.CXMEDIA_TEST_DB_PATH = ':memory:';
process.env.PORT = '0';

const http = require('http');

let pass = 0, fail = 0;
function assert(cond, msg){
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', msg); }
}

const handleRequest = require('../server.js');
const { db, generateId, createSession } = handleRequest.testExports;

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

  const accountId = 'ACC_PUB_PERF_TEST';
  const now = new Date().toISOString();
  db.prepare('INSERT INTO accounts (accountId, company, industry, footprint, createdAt) VALUES (?,?,?,?,?)')
    .run(accountId, 'Pub Perf Test Co', 'travel', 'US', now);
  const campaignId = generateId('CMP');
  db.prepare('INSERT INTO campaigns (id, accountId, objective, segment, stage, keyMessage, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(campaignId, accountId, 'Awareness', 'test', 'Awareness', 'msg', now);
  const { token } = createSession(accountId);
  const auth = { 'Authorization': `Bearer ${token}` };

  // ================= 1) Unauthenticated request is rejected =================
  const noAuthResp = await req('GET', `/api/accounts/${accountId}/channel-planning/publisher-performance?channel=Magazines`);
  assert(noAuthResp.status === 401, 'publisher-performance should require a valid session (401 without one)');

  // ================= 2) channel query param is required =================
  const noChannelResp = await req('GET', `/api/accounts/${accountId}/channel-planning/publisher-performance`, null, auth);
  assert(noChannelResp.status === 400, 'publisher-performance without ?channel should 400');

  // ================= 3) Actuals persist as 4 separate columns via PATCH =================
  const insertResp = await req('POST', `/api/campaigns/${campaignId}/channel-planning`, {
    actorRole: 'cx_ops', actorName: 'Tester', channel: 'Magazines', partner: 'Test Pub', impressions: 100000, budget: 5000
  }, auth);
  assert(insertResp.status === 201, 'insert channel-planning row should 201');
  const entryId = insertResp.json.entryId;

  const patchResp = await req('PATCH', `/api/campaigns/${campaignId}/channel-planning/${entryId}`, {
    actorRole: 'cx_ops', actorName: 'Tester',
    actualCalls: 4, actualQrScans: 30, actualUrlVisits: 12, actualLeads: 2
  }, auth);
  assert(patchResp.status === 200, 'patch actuals should 200');

  const listResp = await req('GET', `/api/campaigns/${campaignId}/channel-planning`, null, auth);
  const savedEntry = listResp.json.entries.find(e => e.id === entryId);
  assert(savedEntry.actualCalls === 4, `actualCalls should persist as 4, got ${savedEntry.actualCalls}`);
  assert(savedEntry.actualQrScans === 30, `actualQrScans should persist as 30, got ${savedEntry.actualQrScans}`);
  assert(savedEntry.actualUrlVisits === 12, `actualUrlVisits should persist as 12, got ${savedEntry.actualUrlVisits}`);
  assert(savedEntry.actualLeads === 2, `actualLeads should persist as 2, got ${savedEntry.actualLeads}`);
  assert(savedEntry.totalEngagement === 48, `totalEngagement should be the sum (48), got ${savedEntry.totalEngagement}`);

  // A row with NO actuals entered yet should read back with totalEngagement:null, not 0 —
  // "unmeasured" and "measured zero" are different states.
  const unmeasuredInsert = await req('POST', `/api/campaigns/${campaignId}/channel-planning`, {
    actorRole: 'cx_ops', actorName: 'Tester', channel: 'Magazines', partner: 'Unmeasured Pub', impressions: 50000, budget: 3000
  }, auth);
  const unmeasuredList = await req('GET', `/api/campaigns/${campaignId}/channel-planning`, null, auth);
  const unmeasuredEntry = unmeasuredList.json.entries.find(e => e.id === unmeasuredInsert.json.entryId);
  assert(unmeasuredEntry.totalEngagement === null, 'a placement with no actuals entered should read totalEngagement:null, not 0');

  // ================= 4) Magazines: grouped by publication only, and score =================
  // rewards the SMALLER, more efficient publication over the bigger one — the
  // direct "not a total circulation report" requirement.
  const magRows = [
    { partner: 'Big Circulation Mag', impressions: 500000, budget: 20000, actualCalls: 10, actualQrScans: 200, actualUrlVisits: 300, actualLeads: 5 }, // totalEngagement 515 — big raw number, weak rate
    { partner: 'Small Sharp Mag',     impressions: 100000, budget: 5000,  actualCalls: 20, actualQrScans: 400, actualUrlVisits: 100, actualLeads: 15 }  // totalEngagement 535 — smaller reach & spend, much sharper rate
  ];
  for (const r of magRows){
    const ins = await req('POST', `/api/campaigns/${campaignId}/channel-planning`, {
      actorRole: 'cx_ops', actorName: 'Tester', channel: 'Magazines', partner: r.partner, impressions: r.impressions, budget: r.budget
    }, auth);
    await req('PATCH', `/api/campaigns/${campaignId}/channel-planning/${ins.json.entryId}`, {
      actorRole: 'cx_ops', actorName: 'Tester',
      actualCalls: r.actualCalls, actualQrScans: r.actualQrScans, actualUrlVisits: r.actualUrlVisits, actualLeads: r.actualLeads
    }, auth);
  }
  const magPerf = await req('GET', `/api/accounts/${accountId}/channel-planning/publisher-performance?channel=Magazines`, null, auth);
  assert(magPerf.status === 200, 'magazines publisher-performance should 200');
  assert(magPerf.json.groupedByAudience === false, 'Magazines should NOT be grouped by audience');
  const bigMag = magPerf.json.rows.find(r => r.partner === 'Big Circulation Mag');
  const smallMag = magPerf.json.rows.find(r => r.partner === 'Small Sharp Mag');
  assert(bigMag && smallMag, 'both magazine rows should be present');
  assert(smallMag.score > bigMag.score, `the smaller, sharper publication should outscore the bigger one: small=${smallMag.score} big=${bigMag.score}`);
  assert(magPerf.json.rows[0].partner === 'Small Sharp Mag', 'the top-ranked row should be the smaller, sharper publication, not the biggest circulation one');
  assert(magPerf.json.scoringNote.includes('no external benchmark'), 'scoringNote should be explicit that this is self-referential, not an external benchmark');

  // ================= 5) Direct Mail: grouped by partner+audience, and =================
  // scored WITHIN each audience segment — the direct "incorporate Audience...
  // to make it fair" requirement. A vendor's only placement on Prospect
  // audience must not be penalized just because Prospect naturally converts
  // differently than a Past-Guest list.
  const channel = 'Direct Mail — Prospects';
  const dmRows = [
    { partner: 'Vendor A', audience: 'PG',       impressions: 10000, budget: 8000,  actualCalls: 5, actualQrScans: 50,  actualUrlVisits: 20, actualLeads: 10 }, // strong on PG
    { partner: 'Vendor B', audience: 'PG',       impressions: 10000, budget: 8000,  actualCalls: 2, actualQrScans: 10,  actualUrlVisits: 5,  actualLeads: 2 },  // weak on PG
    { partner: 'Vendor A', audience: 'Prospect', impressions: 50000, budget: 30000, actualCalls: 3, actualQrScans: 100, actualUrlVisits: 40, actualLeads: 3 }  // only Prospect-segment row, weaker raw rate than PG rows
  ];
  for (const r of dmRows){
    const ins = await req('POST', `/api/campaigns/${campaignId}/channel-planning`, {
      actorRole: 'cx_ops', actorName: 'Tester', channel, partner: r.partner, audience: r.audience, impressions: r.impressions, budget: r.budget
    }, auth);
    await req('PATCH', `/api/campaigns/${campaignId}/channel-planning/${ins.json.entryId}`, {
      actorRole: 'cx_ops', actorName: 'Tester',
      actualCalls: r.actualCalls, actualQrScans: r.actualQrScans, actualUrlVisits: r.actualUrlVisits, actualLeads: r.actualLeads
    }, auth);
  }
  const dmPerf = await req('GET', `/api/accounts/${accountId}/channel-planning/publisher-performance?channel=${encodeURIComponent(channel)}`, null, auth);
  assert(dmPerf.status === 200, 'direct mail publisher-performance should 200');
  assert(dmPerf.json.groupedByAudience === true, 'Direct Mail SHOULD be grouped by audience');
  assert(dmPerf.json.rows.length === 3, `should have 3 partner+audience rows, got ${dmPerf.json.rows.length}`);
  const vendorAPg = dmPerf.json.rows.find(r => r.partner === 'Vendor A' && r.audience === 'PG');
  const vendorBPg = dmPerf.json.rows.find(r => r.partner === 'Vendor B' && r.audience === 'PG');
  const vendorAProspect = dmPerf.json.rows.find(r => r.partner === 'Vendor A' && r.audience === 'Prospect');
  assert(vendorAPg && vendorBPg && vendorAProspect, 'all 3 partner+audience rows should be present');
  assert(vendorAPg.score > vendorBPg.score, `within the PG segment, Vendor A should clearly outscore Vendor B: ${vendorAPg.score} vs ${vendorBPg.score}`);
  // The sole Prospect-segment row is compared only against itself (the max of its own segment) —
  // it should score 100 despite a lower raw rate than the PG rows, because PG and Prospect are never compared directly.
  assert(vendorAProspect.score === 100, `the only Prospect-segment placement should score 100 (scored within its own audience segment, not against PG), got ${vendorAProspect.score}`);

  console.log(`# ${pass} passed, ${fail} failed`);
  server.close();
  process.exitCode = fail > 0 ? 1 : 0;
});

