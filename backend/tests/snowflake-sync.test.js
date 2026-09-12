'use strict';
// 2026-09-13 — Snowflake inbound connector tests. This sandbox has no
// outbound network path to *.snowflakecomputing.com and no real client
// Secure Data Share to test against even if it did (see
// cxmedia-hosting-dependent-items.md item 4), so this verifies the parts
// that ARE verifiable without a live account: the key-pair JWT is
// correctly built and cryptographically signed, snowflakeExecuteStatement
// correctly parses the SQL API's column-metadata/row-array response
// shape, and syncSnowflakeAccount() correctly maps + upserts rows into
// the warehouse_calls/leads/bookings landing tables (including de-dupe on
// a second run). global.fetch is mocked throughout — nothing here
// touches the real network.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

process.env.CXMEDIA_TEST_DB_PATH = ':memory:';
process.env.PORT = '0';

// Real, freshly-generated test-only RSA key pair (not a Snowflake secret,
// not reused anywhere else) — see the test's own README note if this file
// is ever regenerated: `openssl genrsa -out key.pem 2048`.
const TEST_PRIVATE_KEY_PEM = fs.readFileSync(path.join(__dirname, 'fixtures', 'snowflake-test-key.pem'), 'utf8');

process.env.SNOWFLAKE_ACCOUNT_IDENTIFIER = 'testacct-ab12345';
process.env.SNOWFLAKE_USERNAME = 'verilume_svc';
process.env.SNOWFLAKE_PRIVATE_KEY = TEST_PRIVATE_KEY_PEM;
process.env.SNOWFLAKE_WAREHOUSE = 'VERILUME_WH';
process.env.SNOWFLAKE_ROLE = 'VERILUME_READER';

let pass = 0, fail = 0;
function assert(cond, msg){
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', msg); }
}

const handleRequest = require('../server.js');
const {
  db, generateId, getSnowflakeJwt, snowflakePublicKeyFingerprint,
  snowflakeExecuteStatement, syncSnowflakeAccount, firstOf, externalIdFor,
  SNOWFLAKE_CONFIGURED
} = handleRequest.testExports;

function nowIso(){ return new Date().toISOString(); }
function b64urlDecode(s){
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// ================= 1) SNOWFLAKE_CONFIGURED reflects env at load time =================
assert(SNOWFLAKE_CONFIGURED === true, 'SNOWFLAKE_CONFIGURED should be true with all 4 required env vars set');

// ================= 2) getSnowflakeJwt() shape and signature =================
const jwt = getSnowflakeJwt();
const jwtParts = jwt.split('.');
assert(jwtParts.length === 3, 'JWT should have 3 dot-separated parts');
const header = JSON.parse(b64urlDecode(jwtParts[0]));
const claims = JSON.parse(b64urlDecode(jwtParts[1]));
assert(header.alg === 'RS256', 'JWT header alg should be RS256');
assert(header.typ === 'JWT', 'JWT header typ should be JWT');
assert(claims.iss === 'TESTACCT-AB12345.VERILUME_SVC.SHA256:' + snowflakePublicKeyFingerprint(), 'JWT iss should be ACCOUNT.USER.SHA256:fingerprint, uppercased');
assert(claims.sub === 'TESTACCT-AB12345.VERILUME_SVC', 'JWT sub should be ACCOUNT.USER, uppercased');
assert(claims.exp - claims.iat === 3300, 'JWT lifetime should be 55 minutes (3300s)');

// Verify the signature actually validates against the real public key —
// proves this isn't just well-formed JSON, it's a real, correctly-signed
// RS256 JWT that a real Snowflake account would accept.
const publicKeyPem = fs.readFileSync(path.join(__dirname, 'fixtures', 'snowflake-test-key.pub.pem'), 'utf8');
const unsigned = `${jwtParts[0]}.${jwtParts[1]}`;
const signatureBuf = Buffer.from(jwtParts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const verifier = crypto.createVerify('RSA-SHA256');
verifier.update(unsigned);
verifier.end();
assert(verifier.verify(publicKeyPem, signatureBuf) === true, 'JWT signature should verify against the matching public key');

// JWT should be cached — a second call within the same run returns the
// identical token rather than re-signing.
const jwt2 = getSnowflakeJwt();
assert(jwt === jwt2, 'getSnowflakeJwt() should cache and return the same token on a second call');

// ================= 3) snowflakeExecuteStatement() parses SQL API shape =================
let capturedRequests = [];
const realFetch = global.fetch;
function mockFetch(fakeResponses){
  global.fetch = async (url, opts) => {
    capturedRequests.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : null });
    const key = Object.keys(fakeResponses).find(k => url.includes(k));
    const payload = key ? fakeResponses[key] : { resultSetMetaData: { rowType: [] }, data: [] };
    return { ok: true, status: 200, json: async () => payload };
  };
}

capturedRequests = [];
mockFetch({
  '/api/v2/statements': {
    resultSetMetaData: { rowType: [{ name: 'ID' }, { name: 'NAME' }] },
    data: [['1', 'Alpha'], ['2', 'Beta']]
  }
});
(async () => {
  const rows = await snowflakeExecuteStatement('SELECT * FROM FOO');
  assert(rows.length === 2, 'snowflakeExecuteStatement should return 2 parsed rows');
  assert(rows[0].ID === '1' && rows[0].NAME === 'Alpha', 'row 0 should map columns to values correctly');
  assert(rows[1].ID === '2' && rows[1].NAME === 'Beta', 'row 1 should map columns to values correctly');
  const req = capturedRequests[0];
  assert(req.url.includes('testacct-ab12345.snowflakecomputing.com'), 'request URL should target the configured account host');
  assert(req.opts.headers['Authorization'] === `Bearer ${jwt}`, 'request should carry the JWT as a Bearer token');
  assert(req.body.warehouse === 'VERILUME_WH', 'request body should carry the configured warehouse');
  assert(req.body.role === 'VERILUME_READER', 'request body should carry the configured role');

  // ================= 4) firstOf / externalIdFor helpers =================
  assert(firstOf({ a: null, b: 'x' }, ['a', 'b']) === 'x', 'firstOf should skip null and take the next alias');
  assert(firstOf({}, ['a', 'b']) === null, 'firstOf should return null when no alias is present');
  assert(externalIdFor({ id: '42' }, ['id']) === '42', 'externalIdFor should use a real id column when present');
  const hashId1 = externalIdFor({ x: 1, y: 2 }, ['id']);
  const hashId2 = externalIdFor({ x: 1, y: 2 }, ['id']);
  assert(hashId1 === hashId2 && hashId1.startsWith('row_'), 'externalIdFor should fall back to a stable row hash when no id column exists');

  // ================= 5) syncSnowflakeAccount() — not provisioned =================
  const accountId = 'ACC_SF_TEST1';
  db.prepare('INSERT INTO accounts (accountId, company, industry, footprint, createdAt) VALUES (?,?,?,?,?)')
    .run(accountId, 'Snowflake Test Co', 'retail', 'US', nowIso());
  let account = db.prepare('SELECT * FROM accounts WHERE accountId = ?').get(accountId);
  const notProvisioned = await syncSnowflakeAccount(account);
  assert(notProvisioned.configured === true && notProvisioned.connected === false && notProvisioned.reason === 'not_provisioned',
    'syncSnowflakeAccount should report not_provisioned when database/schema are unset');

  // ================= 6) syncSnowflakeAccount() — full sync with all 3 tables =================
  db.prepare(`UPDATE accounts SET analyticsSnowflakeDatabase = ?, analyticsSnowflakeSchema = ?,
    analyticsSnowflakeCallsTable = ?, analyticsSnowflakeLeadsTable = ?, analyticsSnowflakeBookingsTable = ?
    WHERE accountId = ?`)
    .run('AOV_SHARE_DB', 'PUBLIC', 'CALLS', 'LEADS', 'BOOKINGS', accountId);
  account = db.prepare('SELECT * FROM accounts WHERE accountId = ?').get(accountId);

  capturedRequests = [];
  mockFetch({
    '/api/v2/statements': null // overwritten per-request below via a smarter mock
  });
  // Need per-table responses — replace mock with one that inspects the SQL text.
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    capturedRequests.push({ url, body });
    if (body.statement.includes('.CALLS')){
      return { ok: true, status: 200, json: async () => ({
        resultSetMetaData: { rowType: [{ name: 'call_id' }, { name: 'source_system' }, { name: 'from_number' }, { name: 'duration_seconds' }] },
        data: [['CALL-1', 'invoca', '+15551234567', '182'], ['CALL-2', 'ringcentral', '+15559876543', '45']]
      }) };
    }
    if (body.statement.includes('.LEADS')){
      return { ok: true, status: 200, json: async () => ({
        resultSetMetaData: { rowType: [{ name: 'lead_id' }, { name: 'email' }, { name: 'source_system' }] },
        data: [['LEAD-1', 'jane@example.com', 'invoca']]
      }) };
    }
    if (body.statement.includes('.BOOKINGS')){
      return { ok: true, status: 200, json: async () => ({
        resultSetMetaData: { rowType: [{ name: 'booking_id' }, { name: 'value' }, { name: 'currency' }] },
        data: [['BOOK-1', '4200.00', 'USD']]
      }) };
    }
    return { ok: true, status: 200, json: async () => ({ resultSetMetaData: { rowType: [] }, data: [] }) };
  };

  const syncResult = await syncSnowflakeAccount(account);
  assert(syncResult.configured === true, 'sync result should be configured:true');
  assert(syncResult.connected === true, 'sync result should be connected:true after a successful pull');
  assert(syncResult.results.calls.upserted === 2, 'should upsert 2 call rows');
  assert(syncResult.results.leads.upserted === 1, 'should upsert 1 lead row');
  assert(syncResult.results.bookings.upserted === 1, 'should upsert 1 booking row');
  assert(capturedRequests.length === 3, 'should have made exactly 3 Snowflake queries (calls, leads, bookings)');
  assert(capturedRequests.some(r => r.body.statement === 'SELECT * FROM AOV_SHARE_DB.PUBLIC.CALLS'), 'calls query should use the fully-qualified configured table name');

  const landedCalls = db.prepare('SELECT * FROM warehouse_calls WHERE accountId = ? ORDER BY externalId').all(accountId);
  assert(landedCalls.length === 2, 'warehouse_calls should have 2 rows for this account');
  assert(landedCalls[0].externalId === 'CALL-1' && landedCalls[0].sourceSystem === 'invoca' && landedCalls[0].fromNumber === '+15551234567',
    'landed call row should have correctly mapped externalId/sourceSystem/fromNumber');
  assert(Number(landedCalls[0].durationSeconds) === 182, 'landed call row should have correctly mapped durationSeconds');
  const rawPayload = JSON.parse(landedCalls[0].rawPayload);
  assert(rawPayload.call_id === 'CALL-1', 'rawPayload should retain the original source row verbatim');

  const landedLeads = db.prepare('SELECT * FROM warehouse_leads WHERE accountId = ?').all(accountId);
  assert(landedLeads.length === 1 && landedLeads[0].email === 'jane@example.com', 'warehouse_leads should have the mapped lead row');

  const landedBookings = db.prepare('SELECT * FROM warehouse_bookings WHERE accountId = ?').all(accountId);
  assert(landedBookings.length === 1 && Number(landedBookings[0].value) === 4200, 'warehouse_bookings should have the mapped booking row');

  const accountAfterSync = db.prepare('SELECT * FROM accounts WHERE accountId = ?').get(accountId);
  assert(accountAfterSync.analyticsStatus === 'connected', 'a successful sync should flip analyticsStatus to connected');
  assert(!!accountAfterSync.analyticsSnowflakeLastSyncAt, 'a successful sync should stamp analyticsSnowflakeLastSyncAt');
  assert(!accountAfterSync.analyticsSnowflakeLastSyncError, 'a successful sync should leave analyticsSnowflakeLastSyncError null');

  // ================= 7) Re-running sync de-dupes, does not double rows =================
  await syncSnowflakeAccount(db.prepare('SELECT * FROM accounts WHERE accountId = ?').get(accountId));
  const landedCallsAfterRerun = db.prepare('SELECT * FROM warehouse_calls WHERE accountId = ?').all(accountId);
  assert(landedCallsAfterRerun.length === 2, 'a second sync run should upsert (not duplicate) — still 2 call rows');

  // ================= 8) One table failing doesn't block the others =================
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.statement.includes('.CALLS')){
      return { ok: false, status: 500, json: async () => ({ message: 'simulated Snowflake query failure' }) };
    }
    return { ok: true, status: 200, json: async () => ({
      resultSetMetaData: { rowType: [{ name: 'lead_id' }, { name: 'email' }] },
      data: [['LEAD-2', 'sam@example.com']]
    }) };
  };
  const partialFailResult = await syncSnowflakeAccount(db.prepare('SELECT * FROM accounts WHERE accountId = ?').get(accountId));
  assert(!!partialFailResult.results.calls.error, 'calls should report an error when that query fails');
  assert(partialFailResult.results.leads.upserted >= 1, 'leads should still succeed even though calls failed');
  const accountAfterPartialFail = db.prepare('SELECT * FROM accounts WHERE accountId = ?').get(accountId);
  assert(!!accountAfterPartialFail.analyticsSnowflakeLastSyncError, 'a partial failure should record analyticsSnowflakeLastSyncError');

  global.fetch = realFetch;

  console.log(`# ${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
})();
