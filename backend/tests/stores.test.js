'use strict';
// Isolated backend test — real node:sqlite, in-memory. Covers:
//   1) the flat, account-wide stores CRUD contract (GET/POST/DELETE
//      /api/accounts/:id/stores, GET .../stores/prospect-fit) — replaces
//      store-sets.test.js after the 2026-09-10 "named store-location sets"
//      feature was retired the same day it was built, per direct
//      instruction ("This the store card that should be active not new
//      thing") — see the account_store_sets comment in server.js for the
//      full history.
//   2) computeStoreTradeAreas() ring math + batched-lookup behavior (no
//      per-row DB call — prepare() count stays flat as row count grows)
//   3) computeStoreProspectFit() null-vs-zero handling with no demographic
//      coverage
//   4) computeStoreProspectFit()'s qualifiedPopulation estimate (target
//      generations AND wealth together) — added 2026-09-10, rebuilt
//      2026-09-11 to use only the already-computed ring-level Wealth
//      Index (no Census income-bracket data) per Todd's direct correction,
//      then rebuilt again 2026-09-12 to compare each ZIP's Wealth Index
//      against the account's own numeric Wealth Index instead of its
//      HNW/Wealthy/Middle tier bucket
process.env.CXMEDIA_TEST_DB_PATH = ':memory:';
process.env.PORT = '0';

let pass = 0, fail = 0;
function assert(cond, msg){
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', msg); }
}

const handleRequest = require('../server.js');
const { db, generateId, computeStoreTradeAreas, computeStoreProspectFit } = handleRequest.testExports;

function nowIso(){ return new Date().toISOString(); }

// ---------- Setup: one account ----------
const accountId = 'ACC_TEST1';
db.prepare('INSERT INTO accounts (accountId, company, industry, footprint, createdAt) VALUES (?,?,?,?,?)')
  .run(accountId, 'Test Co', 'retail', 'US', nowIso());

// ================= 1) Flat stores CRUD via the real route handler =================
async function callRoute(method, url, body, tok){
  return new Promise((resolve) => {
    const req = {
      method, url,
      headers: { authorization: `Bearer ${tok}` },
      on(event, cb){ if (event === 'data' && body) cb(Buffer.from(JSON.stringify(body))); if (event === 'end') cb(); }
    };
    const res = {
      statusCode: 200,
      setHeader(){}, writeHead(code){ this.statusCode = code; },
      end(data){ resolve({ status: this.statusCode, body: data ? JSON.parse(data) : null }); }
    };
    handleRequest(req, res);
  });
}

async function runCrudTests(){
  // Seed a real session so requireAccount() passes.
  const token = 'TESTTOKEN1';
  db.prepare('INSERT INTO sessions (token, accountId, createdAt, expiresAt) VALUES (?,?,?,?)')
    .run(token, accountId, nowIso(), new Date(Date.now() + 3600000).toISOString());
  const authedReq = (method, path, body) => callRoute(method, path, body, token);

  const emptyResp = await authedReq('GET', `/api/accounts/${accountId}/stores`);
  assert(emptyResp.status === 200 && emptyResp.body.stores.length === 0, 'GET stores on a brand-new account returns an empty list, not an error or a "create a set" gate');

  const addStoreResp = await authedReq('POST', `/api/accounts/${accountId}/stores`, { storeId: 'NEW1', name: 'New Store', postalCode: '10001', country: 'US' });
  assert(addStoreResp.status === 200 && addStoreResp.body.inserted === 1, 'POST stores adds a store with no setId in the request');

  const getStoresResp = await authedReq('GET', `/api/accounts/${accountId}/stores`);
  assert(getStoresResp.status === 200 && getStoresResp.body.stores.length === 1, 'GET stores (flat, no setId) returns the store just added');
  assert(getStoresResp.body.stores[0].storeId === 'NEW1', 'result carries camelCase storeId correctly (explicit AS alias)');
  const storeRowId = getStoresResp.body.stores[0].id;

  // Upsert by storeId (no setId scoping — matches on accountId+storeId only).
  const upsertResp = await authedReq('POST', `/api/accounts/${accountId}/stores`, { storeId: 'NEW1', name: 'New Store Renamed', postalCode: '10001', country: 'US' });
  assert(upsertResp.status === 200 && upsertResp.body.inserted === 1, 'POST stores with an existing storeId upserts rather than duplicating');
  const afterUpsert = await authedReq('GET', `/api/accounts/${accountId}/stores`);
  assert(afterUpsert.body.stores.length === 1 && afterUpsert.body.stores[0].name === 'New Store Renamed', 'upsert updated the existing row in place, still just one store');

  const addSecondResp = await authedReq('POST', `/api/accounts/${accountId}/stores`, { storeId: 'NEW2', name: 'Second Store', postalCode: '10002', country: 'US' });
  assert(addSecondResp.status === 200, 'a second store can be added alongside the first — one flat list, no set boundary');
  const afterSecond = await authedReq('GET', `/api/accounts/${accountId}/stores`);
  assert(afterSecond.body.stores.length === 2, 'account now has two stores on its one flat list');

  const deleteResp = await authedReq('DELETE', `/api/accounts/${accountId}/stores/${storeRowId}`);
  assert(deleteResp.status === 200 && deleteResp.body.deleted === true, 'DELETE stores/:id removes a single store row');
  const afterDelete = await authedReq('GET', `/api/accounts/${accountId}/stores`);
  assert(afterDelete.body.stores.length === 1, 'the other store is untouched after deleting one');

  const prospectFitResp = await authedReq('GET', `/api/accounts/${accountId}/stores/prospect-fit`);
  assert(prospectFitResp.status === 200, 'GET stores/prospect-fit works with no setId param');

  // replace:true wipes the whole account's list, not a scoped subset.
  const replaceResp = await authedReq('POST', `/api/accounts/${accountId}/stores`, { rows: [{ storeId: 'FRESH1', name: 'Fresh Store', postalCode: '10003', country: 'US' }], replace: true });
  assert(replaceResp.status === 200 && replaceResp.body.inserted === 1, 'POST stores with replace:true accepts the new row');
  const afterReplace = await authedReq('GET', `/api/accounts/${accountId}/stores`);
  assert(afterReplace.body.stores.length === 1 && afterReplace.body.stores[0].storeId === 'FRESH1', 'replace:true wiped the prior list and left only the new store');

  // The old store-sets endpoints no longer exist at all.
  const oldSetsResp = await authedReq('GET', `/api/accounts/${accountId}/store-sets`);
  assert(oldSetsResp.status !== 200, 'the retired GET .../store-sets route no longer responds 200 (falls through to 404/unmatched)');
}

// ================= 2) computeStoreTradeAreas: ring math + batched lookups =================
function seedGeoData(){
  const now = nowIso();
  // Two stores' worth of zips, spread over distance.
  const centroids = [
    ['10001', 40.75, -73.99], // store A area
    ['10002', 40.76, -73.98],
    ['10003', 40.90, -73.80], // farther out — within 10mi maybe not 3mi
    ['20001', 41.50, -74.50], // far away — store B area
    ['20002', 41.51, -74.49]
  ];
  centroids.forEach(([zip, lat, lng]) => {
    db.prepare('INSERT INTO zip_centroid_master (zip, lat, lng, sourceLabel, updatedAt) VALUES (?,?,?,?,?)').run(zip, lat, lng, 'test', now);
  });
  const pops = [['10001', 5000], ['10002', 3000], ['10003', 2000], ['20001', 4000], ['20002', 1000]];
  pops.forEach(([zip, p]) => {
    db.prepare('INSERT INTO zip_population_master (zip, population, sourceLabel, updatedAt) VALUES (?,?,?,?)').run(zip, p, 'test', now);
  });
}
seedGeoData();

function testTradeAreaRingMath(){
  const stores = [
    { id: 'STOREA', storeId: 'A', name: 'Store A', address: '', lat: 40.75, lng: -73.99 },
    { id: 'STOREB', storeId: 'B', name: 'Store B', address: '', lat: 41.50, lng: -74.50 }
  ];
  const rows = [
    { zip: '10001', customerCount: 100, revenue: null },
    { zip: '10002', customerCount: 50, revenue: null },
    { zip: '20001', customerCount: 80, revenue: null }
  ];
  const result = computeStoreTradeAreas(rows, stores, [3, 5, 10], 'count');
  assert(result.available === true, 'trade area result is available with geocoded stores');
  assert(result.stores.length === 2, 'trade area result has one entry per geocoded store');
  const storeA = result.stores.find(s => s.id === 'STOREA');
  const ring3 = storeA.rings.find(r => r.radiusMiles === 3);
  assert(ring3.volume === 150, 'store A 3-mile ring picks up its own nearby customer volume (100+50)');
  assert(ring3.population === 8000, 'store A 3-mile ring population sums its nearby zips (5000+3000)');
  assert(ring3.penetrationRate === 150 / 8000, 'penetration rate = volume/population');
  assert(typeof result.beyondRings === 'number' && typeof result.unmapped === 'number', 'beyondRings/unmapped are tracked');
  assert(result.disclosure && /straight-line/i.test(result.disclosure), 'includes a plain-language disclosure about approximate distance');
}
testTradeAreaRingMath();

function testTradeAreaBatchedLookups(){
  // Wrap db.prepare to count real prepare() calls, then confirm the count
  // does NOT grow with the number of customer rows passed in — the
  // documented N+1 bug this function must never reintroduce.
  const stores = [{ id: 'STOREA', storeId: 'A', name: 'Store A', lat: 40.75, lng: -73.99 }];
  let calls = 0;
  const origPrepare = db.prepare.bind(db);
  db.prepare = function(sql){ calls++; return origPrepare(sql); };
  try {
    const smallRows = Array.from({ length: 5 }, (_, i) => ({ zip: '10001', customerCount: 1, revenue: null }));
    calls = 0;
    computeStoreTradeAreas(smallRows, stores, [3, 5, 10], 'count');
    const callsSmall = calls;

    const bigRows = Array.from({ length: 500 }, (_, i) => ({ zip: '10001', customerCount: 1, revenue: null }));
    calls = 0;
    computeStoreTradeAreas(bigRows, stores, [3, 5, 10], 'count');
    const callsBig = calls;

    assert(callsSmall === callsBig, `prepare() call count stays flat regardless of row count (5 rows: ${callsSmall} calls, 500 rows: ${callsBig} calls)`);
    assert(callsBig < 10, `prepare() call count is small/constant, not proportional to row count (got ${callsBig})`);
  } finally {
    db.prepare = origPrepare;
  }
}
testTradeAreaBatchedLookups();

// ================= 3) computeStoreProspectFit: null vs zero =================
function testProspectFitNullVsZero(){
  const stores = [{ id: 'STOREA', storeId: 'A', name: 'Store A', lat: 40.75, lng: -73.99 }];
  const account = { audience: 'genz, millennial', wealth: 'wealthy' };
  // No demographic data loaded at all yet -> every ring must show null,
  // never 0, for audienceFit/wealthFit.
  const result = computeStoreProspectFit(stores, [5, 10, 15], account);
  assert(result.available === true, 'prospect-fit is available once a store is geocoded, even with zero demographic coverage');
  const ring = result.stores[0].rings[0];
  assert(ring.audienceFit === null, 'audienceFit is null (not 0) when the ring has no demographic coverage');
  assert(ring.wealthFit === null, 'wealthFit is null (not 0) when the ring has no demographic coverage');
  assert(ring.noRingDemographicCoverage === true, 'noRingDemographicCoverage flag is set so the UI can explain the blank');
  assert(result.zipsWithAnyDemographicData === 0, 'zipsWithAnyDemographicData is honestly 0');
  assert(typeof result.demographicCoverageNote === 'string' && result.demographicCoverageNote.length > 0, 'demographicCoverageNote explains the gap');

  // Now load real demographic data for one ring's zips and confirm it
  // switches to a real number, not null, and not a bogus 0 either.
  const now = nowIso();
  ['population_genz', 'population_millennial', 'population_genx', 'population_boomer', 'population_silent'].forEach(attr => {
    db.prepare('INSERT INTO zip_demographic_master (zip, attribute, value, sourceLabel, updatedAt) VALUES (?,?,?,?,?)')
      .run('10001', attr, attr === 'population_genz' ? 1000 : 500, 'test', now);
  });
  // 2026-09-11: income_avg_estimate was replaced by a live weighted-average
  // computed from real per-bracket household counts (zipAvgIncomeBackend()
  // in server.js) — set the minimum fixture that produces a real,
  // computable average (all households in the top bracket, with a real
  // top-bracket dollar average on file, same as the corrected pipeline).
  ['income_hh_total', 'income_hh_017'].forEach(attr => {
    db.prepare('INSERT INTO zip_demographic_master (zip, attribute, value, sourceLabel, updatedAt) VALUES (?,?,?,?,?)')
      .run('10001', attr, 100, 'test', now);
  });
  db.prepare('INSERT INTO zip_demographic_master (zip, attribute, value, sourceLabel, updatedAt) VALUES (?,?,?,?,?)')
    .run('10001', 'income_top_bracket_avg', 90000, 'test', now);

  const result2 = computeStoreProspectFit(stores, [5, 10, 15], account);
  const ring2 = result2.stores[0].rings[0];
  assert(ring2.noRingDemographicCoverage === false, 'ring with real demographic data is no longer flagged as uncovered');
  assert(ring2.audienceFit !== null, 'audienceFit becomes a real number once demographic data covers the ring');
  assert(ring2.wealthFit !== null, 'wealthFit becomes a real number once demographic + income data covers the ring');
}
testProspectFitNullVsZero();

// ============= 4) computeStoreProspectFit: qualifiedPopulation estimate =============
// Round 2026-09-11, per Todd's direct correction to the 2026-09-10 Census-
// income-bracket approach ("I don't want you to use the census age -
// income bracket. It's worthless... I selected the option to use the
// Verilume Wealth Index that we calculate upfront in combination with the
// age brackets that we capture with the generation selections. You have
// all of the data that you need."). qualifiedPopulation now reuses ONLY
// the already-computed ring-level wealthIndex and targetPopulation — no
// bracket-level qualifying logic at all. (Real per-bracket household
// counts came back the same day, per a SEPARATE, later correction — see
// zipAvgIncomeBackend()'s comment in server.js — but only to compute one
// honest weighted-average income per zip, not to qualify brackets
// individually.)
// Updated 2026-09-12, per direct correction — Qualified no longer tests a
// ZIP's Wealth Index against the account's HNW/Wealthy/Middle tier bucket;
// it now compares directly against the account's own NUMERIC Wealth Index
// (accounts.wealthIndexTargetIncome). Uses zip 10001 (the only zip
// nationally with income data on file at this point in the suite, all in
// the top bracket with a real top-bracket average set) so ring avg income
// == national avg income, making the ring's own wealthIndex land exactly
// on genMult*100 (boomer genMult = 1.82 -> ring index 182). The account's
// own wealthIndexTargetIncome is varied across sub-cases to exercise the
// qualifying, non-qualifying, and no-data-yet branches of the same
// index-vs-index comparison.
function testQualifiedPopulationEstimate(){
  const stores = [{ id: 'STOREQ', storeId: 'Q', name: 'Store Q', lat: 40.75, lng: -73.99 }];
  const now = nowIso();
  const setAttr = (attribute, value) => db.prepare('INSERT OR REPLACE INTO zip_demographic_master (zip, attribute, value, sourceLabel, updatedAt) VALUES (?,?,?,?,?)').run('10001', attribute, value, 'test', now);
  setAttr('population_boomer', 5000);
  ['population_genz', 'population_millennial', 'population_genx', 'population_silent'].forEach(a => setAttr(a, 0));
  // All households in the top bracket, with a real per-zip top-bracket
  // average (income_top_bracket_avg, IRS-sourced in production) of
  // $100,000 — zipAvgIncomeBackend() uses that real figure instead of the
  // flat $225,000 fallback when it's on file, so the ring's computed
  // average income lands exactly on $100,000, matching nationalAvgIncome
  // exactly (this is the only zip with income data on file).

  setAttr('income_hh_total', 1000);
  setAttr('income_hh_017', 1000);
  setAttr('income_top_bracket_avg', 100000);

  // Account's own Wealth Index target income = $100,000, same as the
  // ring's (and national) avg income -> accountWealthIndex computes to the
  // same genMult*100 = 182 as the ring's own index -> "at or above" clears
  // it exactly, so the whole target-generation population counts as
  // Qualified. No new data pull: targetPopulation and wealthIndex are both
  // already computed above for every ring.
  const accountAtIndex = { audience: 'boomer', wealthIndexTargetIncome: 100000 };
  const result = computeStoreProspectFit(stores, [50], accountAtIndex);
  const ring = result.stores[0].rings[0];
  assert(result.accountWealthIndex === 182, `account's own Wealth Index computes to genMult*100 when its target income == national avg income (boomer genMult 1.82 -> 182), got ${result.accountWealthIndex}`);
  assert(ring.targetPopulation === 5000, 'targetPopulation is the boomer-only population (age filter, no wealth)');
  assert(ring.wealthFit === 182, `ring wealthIndex is genMult*100 when ring avg income == national avg income (boomer genMult 1.82 -> 182), got ${ring.wealthFit}`);
  assert(ring.qualifiedPopulation === 5000, `qualifiedPopulation = targetPopulation (5000) when the ring's Wealth Index (182) is at or above the account's own Wealth Index (182), got ${ring.qualifiedPopulation}`);

  // Same ring, a tougher account target ($150,000 -> accountWealthIndex
  // 273) — the ring's index (182) now falls short, so qualifiedPopulation
  // is a real 0 (a genuine "none of this ring qualifies" answer), never
  // null and never a fabricated partial estimate.
  const accountAboveIndex = { audience: 'boomer', wealthIndexTargetIncome: 150000 };
  const result2 = computeStoreProspectFit(stores, [50], accountAboveIndex);
  const ring2 = result2.stores[0].rings[0];
  assert(result2.accountWealthIndex === 273, `account's own Wealth Index scales with its target income (150% of $100k -> 273), got ${result2.accountWealthIndex}`);
  assert(ring2.qualifiedPopulation === 0, `qualifiedPopulation = 0 (real zero, not null) when the ring's Wealth Index (182) misses the account's own Wealth Index (273), got ${ring2.qualifiedPopulation}`);
  assert(ring2.targetPopulation === 5000, 'targetPopulation is unaffected by the account\'s configured Wealth Index target');

  // No account household income configured yet (wealthIndexTargetIncome
  // null) -> qualifiedPopulation must be a real null (not a fabricated 0
  // or a full count), with a note explaining why, while targetPopulation
  // (age-only) still computes normally.
  const accountNoIncome = { audience: 'boomer', wealthIndexTargetIncome: null };
  const result3 = computeStoreProspectFit(stores, [50], accountNoIncome);
  const ring3 = result3.stores[0].rings[0];
  assert(result3.accountWealthIndex === null, 'accountWealthIndex is null (not a guessed number) with no household income set on the account');
  assert(ring3.qualifiedPopulation === null, 'qualifiedPopulation is null (not 0) with no household income configured on the account');
  assert(typeof result3.qualifiedCoverageNote === 'string' && result3.qualifiedCoverageNote.length > 0, 'qualifiedCoverageNote explains the missing household income');
  assert(ring3.targetPopulation === 5000, 'targetPopulation still computes without a household income set — it never depends on one');
}
testQualifiedPopulationEstimate();

runCrudTests().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}).catch(e => {
  console.error('Test run crashed:', e);
  process.exit(1);
});

