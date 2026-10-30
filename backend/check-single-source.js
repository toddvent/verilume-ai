// Build check for the single source of truth. Run from the backend folder:  node check-single-source.js   (Node 22+)
// 1) Loads the shared readers (SOT region) and the data-question code (DQ region) over a real in-memory database with made-up
//    budget, lead and spend rows, and checks that every door gives the same number.
// 2) Counts raw reads of the shared tables that still bypass the shared readers, and fails if that number goes UP.
//    Lower the baseline in single-source-baseline.json whenever readers are moved over.
const fs = require('fs'), vm = require('vm'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b); if (i < 0 || j < 0){ console.error('FAIL: markers missing: ' + a); process.exit(1); } return src.slice(i, j); };
const sotRegion = cut('// ==== SOT BEGIN ====', '// ==== SOT END ====');
const dqRegion = cut('// ==== DQ BEGIN ====', '// ==== DQ END ====');
const rs = src.indexOf('function resolveDateRange(spec, now){'); const resolveFn = src.slice(rs, src.indexOf('\n}\n', rs) + 3);
const db = new DatabaseSync(':memory:');
db.exec(`
 CREATE TABLE marketing_budget_uploads (id TEXT, accountId TEXT, year INT, scope TEXT, status TEXT, fileName TEXT, confirmedAt TEXT, totalOnly INT);
 CREATE TABLE marketing_budget_line_items (id TEXT, uploadId TEXT, accountId TEXT, category TEXT, status TEXT, month TEXT, amount REAL, verilumeCategory TEXT);
 CREATE TABLE account_lead_counts (accountId TEXT, year INT, month INT, source TEXT, leadType TEXT, formName TEXT, count INT, bookings INT, avgDaysToConvert REAL);
 CREATE TABLE account_website_users_monthly (accountId TEXT, year INT, month INT, region TEXT, users INT);
 CREATE TABLE account_digital_performance (accountId TEXT, year INT, month INT, grain TEXT, channel TEXT, spend REAL);
`);
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const up = (id, year, status, at, totalOnly) => db.prepare('INSERT INTO marketing_budget_uploads VALUES (?,?,?,?,?,?,?,?)').run(id, 'A', year, 'domestic', status, id + '.xlsx', at, totalOnly || 0);
const line = (u, st, mo, amt) => db.prepare('INSERT INTO marketing_budget_line_items VALUES (?,?,?,?,?,?,?,?)').run(u + st + mo, u, 'A', 'Paid Social', st, mo, amt, null);
up('U25old', 2025, 'confirmed', '2025-01-05', 0); M.forEach(m => line('U25old', 'WORKING MEDIA', m, 999999));       // superseded, must not count
up('U25', 2025, 'confirmed', '2025-02-05', 0); M.forEach(m => { line('U25', 'WORKING MEDIA', m, 600000); line('U25', 'NON-WORKING MEDIA', m, 100000); });
up('U26', 2026, 'confirmed', '2026-01-05', 0); M.forEach(m => line('U26', 'WORKING MEDIA', m, 500000));
up('U26total', 2026, 'confirmed', '2026-03-05', 1); line('U26total', 'WORKING MEDIA', 'Jan', 777777);               // newer but total-only, must not count
up('U26pend', 2026, 'pending_category_mapping', null, 0); M.forEach(m => line('U26pend', 'WORKING MEDIA', m, 888888)); // pending, must not count
for (let m = 1; m <= 12; m++){ db.prepare('INSERT INTO account_lead_counts VALUES (?,?,?,?,?,?,?,?,?)').run('A', 2025, m, 'Web', m % 2 ? 'Registration' : 'Prospect', 'f', 10, 1, 5); db.prepare('INSERT INTO account_website_users_monthly VALUES (?,?,?,?,?)').run('A', 2025, m, 'US', 1000); }
for (let m = 1; m <= 12; m++){ db.prepare('INSERT INTO account_digital_performance VALUES (?,?,?,?,?,?)').run('A', 2025, m, 'overview', 'Search', 100); db.prepare('INSERT INTO account_digital_performance VALUES (?,?,?,?,?,?)').run('A', 2025, m, 'detail', 'Search', 100); }
const RANGE = { from: '2000-01-01', through: '2100-01-01', compFrom: '1999-01-01', compThrough: '1999-12-31', label: 'range', compLabel: 'prior' };
const ctx = { createTableIfNeeded(){}, ensureColumn(){}, console, Math, Date, Map, Set, Number, String, Array, Object, JSON, RegExp, Infinity, Error, isFinite, process: { env: {} }, db,
  aliasVal: (r, k) => r[k], getTransactionSettings: () => ({}), rowCounts: () => true, TXN_FILTER_COLUMNS: [], callClaudeForJSON: async () => null, _gpCache: new Map(),
  dqVocab: () => ({ orderSizeLabel: 'Trip Days', orderSizeSyn: [] }), dqSavedEdges: () => null,
  // stand-ins for the blended spend layer, which lives outside the regions: 2025 reported spend is 2,000 a month
  dmLoadSources: () => ({ manualBy: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2025-${String(i + 1).padStart(2, '0')}||Search`, { spend: 2000 }])), digitalBy: {}, camp: {} }),
  dmDailyMetrics: (s, from) => ({ days: { [from]: { spend: s.manualBy[`${from.slice(0, 7)}||Search`] ? 2000 : null } } }), dmSum: days => Object.values(days).reduce((a, d) => a + (d.spend || 0), 0), dmPad: n => String(n).padStart(2, '0'), dmDim: () => 30 };
vm.createContext(ctx);
vm.runInContext(resolveFn + '\n' + sotRegion + '\n' + dqRegion, ctx);
vm.runInContext('dqLoadTransactions = function(){ return { txs: [], settings: {}, rowCount: 0, excludedRows: 0 }; }', ctx);
let failed = 0; const check = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + (extra || ''))); if (!ok) failed++; };
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const run = (fn, ...a) => vm.runInContext(fn, ctx)(...a);
(async () => {
  const w = run('sotBudgetMonthly', 'A', { working: true }), all = run('sotBudgetMonthly', 'A');
  check('budget: only the latest confirmed line-by-line upload counts (2025 working 7.2M + 2026 working 6.0M)', sum(w) === 7200000 + 6000000, sum(w));
  check('budget: working and non-working together', sum(all) === 7200000 + 1200000 + 6000000, sum(all));
  check('budget: months are real year-months', w['2025-01'] === 600000 && w['2026-12'] === 500000, JSON.stringify(Object.keys(w).slice(0, 3)));
  const ask = async q => { const p = run('dqSetParse', q, 'A'); if (!p) return null; const r = run('dqSetRun', 'A', p.spec, RANGE); return { p, r }; };
  let a = await ask('total budgeted media spend 2025'); const m1 = a && a.r && a.r.x && /\$7,200,000/.test(a.r.x.summary);
  check('ask: budgeted media spend 2025 = $7,200,000 (working media only)', !!m1, a && a.r && a.r.x && a.r.x.summary);
  a = await ask('total marketing budget 2025'); check('ask: marketing budget 2025 = $8,400,000 (working + non-working)', !!(a && a.r && a.r.x && /\$8,400,000/.test(a.r.x.summary)), a && a.r && a.r.x && a.r.x.summary);
  a = await ask('total media spend 2025'); check('ask: media spend (all channels) comes from the shared spend reader = $24,000', !!(a && a.p.spec.set === 'reportedSpend' && a.r && a.r.x && /\$24,000/.test(a.r.x.summary)), a && a.r && a.r.x && a.r.x.summary);
  a = await ask('agency digital spend 2025'); check('ask: agency digital spend reads overview rows only = $1,200', !!(a && a.p.spec.set === 'digital' && a.r && a.r.x && /\$1,200/.test(a.r.x.summary)), a && a.r && a.r.x && a.r.x.summary);
  a = await ask('total leads 2025'); check('leads: shared reader gives 120 leads and reads Registration as Growth', !!(a && a.r && a.r.x && /\b120\b/.test(a.r.x.summary)) && run('sotLeadRows', 'A').filter(r => r.leadType === 'Growth').length === 6, a && a.r && a.r.x && a.r.x.summary);
  check('cache: a second read is the same object until invalidated', run('sotBudgetLines', 'A') === run('sotBudgetLines', 'A'));
  db.prepare('DELETE FROM marketing_budget_line_items WHERE uploadId = ?').run('U26'); run('sotInvalidate', 'A');
  check('cache: after invalidation the new data shows', sum(run('sotBudgetMonthly', 'A', { working: true })) === 7200000, sum(run('sotBudgetMonthly', 'A', { working: true })));
  const f = run('sotFreshness', 'A'); check('freshness reports what is on file', f.budget && f.leads && f.leads.months === 12 && f.reportedSpend, JSON.stringify(f).slice(0, 200));
  // ---- ratchet: raw reads of shared tables that bypass the shared readers
  const out = src.slice(0, src.indexOf('// ==== SOT BEGIN ====')) + src.slice(src.indexOf('// ==== SOT END ====')); // reads inside the SOT region are the allowed ones
  const dqIn = out.indexOf('// ==== DQ BEGIN ===='), dqOut = out.indexOf('// ==== DQ END ====');
  const body = out.slice(0, dqIn) + out.slice(dqOut);
  const tables = ['marketing_budget_uploads', 'marketing_budget_line_items', 'account_digital_performance', 'account_lead_counts', 'account_website_users_monthly', 'account_transactions_monthly', 'account_annual_plan'];
  const counts = {}; tables.forEach(t => { counts[t] = body.split('\n').filter(l => new RegExp('(FROM|JOIN)\\s+' + t + '\\b', 'i').test(l) && /\bSELECT\b/i.test(l) && !/\b(DELETE|INSERT|UPDATE)\b/i.test(l.replace(/SELECT[\s\S]*/i, m => ''))).length; });
  const basePath = path.join(__dirname, 'single-source-baseline.json');
  if (process.argv.includes('--write-baseline')){ fs.writeFileSync(basePath, JSON.stringify(counts, null, 2) + '\n'); console.log('baseline written', JSON.stringify(counts)); }
  else if (fs.existsSync(basePath)){
    const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    tables.forEach(t => check(`ratchet: raw reads of ${t} (${counts[t]}) not above baseline (${base[t]})`, counts[t] <= base[t]));
    const left = tables.reduce((a, t) => a + counts[t], 0); console.log(`\n${left} raw reads of shared tables still bypass the shared readers.`);
  }
  console.log(failed ? '\n' + failed + ' check(s) FAILED.' : '\nAll single-source checks passed.'); process.exit(failed ? 1 : 0);
})();
