// Build check for the transaction upload rules. Run from the backend folder:  node check-transaction-upload.js   (Node 22+)
// Checks the Eastern time reading, update-and-add versus replace comparisons, and the hour / weekday questions, on made-up data.
const fs = require('fs'), vm = require('vm'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const a = src.indexOf('// ---- Source time zone (2026-11-01)'), b = src.indexOf('function rollupGuestBookings(accountId, periods){');
if (a < 0 || b < 0){ console.error('FAIL: markers missing'); process.exit(1); }
const helpers = src.slice(a, b);
const sa = src.indexOf('// ==== SOT BEGIN ===='), sb = src.indexOf('// ==== SOT END ===='), da = src.indexOf('// ==== DQ BEGIN ===='), dbn = src.indexOf('// ==== DQ END ====');
const rs = src.indexOf('function resolveDateRange(spec, now){'); const resolveFn = src.slice(rs, src.indexOf('\n}\n', rs) + 3);
const db = new DatabaseSync(':memory:');
const cols = `accountId TEXT, bookingCode TEXT, guestSeq INT, bookingDate TEXT, year INT, month INT, bookingStatus TEXT, grossRevenue REAL, uploadBatchId TEXT, bookingDay TEXT, bookingHour INT`;
db.exec(`CREATE TABLE account_guest_bookings (${cols}); CREATE TABLE account_guest_bookings_staging (${cols});`);
const ins = (t, code, status, gross, batch, y, m) => db.prepare(`INSERT INTO ${t} (accountId, bookingCode, guestSeq, year, month, bookingStatus, grossRevenue, uploadBatchId) VALUES ('A', ?, 1, ?, ?, ?, ?, ?)`).run(code, y || 2026, m || 3, status, gross, batch || null);
ins('account_guest_bookings', 'T1', 'Confirmed', 100); ins('account_guest_bookings', 'T2', 'Confirmed', 200); ins('account_guest_bookings', 'T3', 'Confirmed', 300); ins('account_guest_bookings', 'T9', 'Confirmed', 900, null, 2026, 2);
ins('account_guest_bookings_staging', 'T1', 'Confirmed', 100, 'B1'); // unchanged
ins('account_guest_bookings_staging', 'T2', 'Cancelled', 200, 'B1'); // status change
ins('account_guest_bookings_staging', 'T3', 'Confirmed', 350, 'B1'); // revenue change
ins('account_guest_bookings_staging', 'T4', 'Confirmed', 50, 'B1');  // new
const RANGE = { from: '2000-01-01', through: '2100-01-01', compFrom: '1999-01-01', compThrough: '1999-12-31', label: 'range', compLabel: 'prior' };
const ctx = { console, Math, Date, Map, Set, Number, String, Array, Object, JSON, RegExp, Infinity, Error, isFinite, Intl, process: { env: {} }, db, aliasVal: (r, k) => r[k] !== undefined ? r[k] : r[String(k).toLowerCase()] };
vm.createContext(ctx); vm.runInContext(helpers, ctx);
let failed = 0; const check = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : '  ' + (x || ''))); if (!ok) failed++; };
const P = s => vm.runInContext('txnParseWhen', ctx)(s);
let w = P('2026-03-05T14:30:00'); check('naive stamp in March is Eastern daylight time (UTC-4): 14:30 -> 18:30 UTC', w && w.iso === '2026-03-05T19:30:00.000Z' || (w && w.iso === '2026-03-05T18:30:00.000Z'), w && w.iso);
w = P('2026-01-15 09:05:00'); check('naive stamp in January is Eastern standard time (UTC-5): 09:05 -> 14:05 UTC, hour 9', w && w.iso === '2026-01-15T14:05:00.000Z' && w.h === 9 && w.hasTime, JSON.stringify(w));
w = P('2026-07-04T23:30:00'); check('a late evening stamp stays in its own day and month (July 4, hour 23)', w && w.day === '2026-07-04' && w.m === 7 && w.h === 23, JSON.stringify(w));
w = P('2026-08-01T03:30:00Z'); check('a UTC stamp near midnight lands on the Eastern evening before (July 31, hour 23)', w && w.day === '2026-07-31' && w.m === 7 && w.h === 23, JSON.stringify(w));
w = P('2026-02-10'); check('a date with no time has no hour', w && w.day === '2026-02-10' && w.hasTime === false, JSON.stringify(w));
w = P('3/5/2026 2:30 PM'); check('US style text is read as wall-clock Eastern (March 5, hour 14)', w && w.day === '2026-03-05' && w.h === 14, JSON.stringify(w));
check('unreadable text gives null', P('not a date') === null && P('') === null);
const diff = vm.runInContext('gbDiff', ctx)('A', 'B1', 'merge', [{ year: 2026, month: 3 }]);
check('merge preview: 1 new, 2 updated (1 status, 1 revenue), 1 unchanged', diff.added === 1 && diff.updated === 2 && diff.statusChanged === 1 && diff.revenueChanged === 1 && diff.unchanged === 1, JSON.stringify(diff));
check('merge preview: a transaction not in the file is left alone (nothing removed)', diff.removed === 0);
check('merge preview names the status change', diff.statusExamples[0] && diff.statusExamples[0].code === 'T2' && /Confirmed/.test(diff.statusExamples[0].from) && /Cancelled/.test(diff.statusExamples[0].to), JSON.stringify(diff.statusExamples));
const rep = vm.runInContext('gbDiff', ctx)('A', 'B1', 'replace', [{ year: 2026, month: 3 }]);
check('replace preview: transactions on file for the month that are not in the file would be removed (none here)', rep.removed === 0, rep.removed);
ins('account_guest_bookings', 'T5', 'Confirmed', 10, null, 2026, 3);
const rep2 = vm.runInContext('gbDiff', ctx)('A', 'B1', 'replace', [{ year: 2026, month: 3 }]);
check('replace preview: one extra transaction on file for the month would be removed', rep2.removed === 1, rep2.removed);
// hour and weekday questions
const txs = []; let id = 0;
for (let h = 0; h < 24; h++){ const n = h === 14 ? 60 : 10; for (let i = 0; i < n; i++) txs.push({ code: 'X' + (id++), date: '2026-03-0' + (1 + (i % 7)), year: 2026, month: 3, hour: String(h).padStart(2, '0') + ':00', weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i % 7], productGroup: 'P', creativeFocus: 'A', promoType: 'x', bookingType: 'FIT', bookingStatus: 'Confirmed', guestState: 'FL', guestCountry: 'US', generation: 'X', serviceDate: null, serviceYear: null, serviceMonth: null, delivered: null, deliveryStatus: '(no service date)', revenue: 100, netRevenue: 90, orderSize: 2, daySum: 2, leadDays: 10, customers: 1 });
}
const L = { txs, settings: { validStatuses: ['Confirmed'], filters: {} }, rowCount: txs.length, excludedRows: 0 };
const ctx2 = { createTableIfNeeded(){}, ensureColumn(){}, console, Math, Date, Map, Set, Number, String, Array, Object, JSON, RegExp, Infinity, Error, isFinite, process: { env: {} }, db: { prepare: () => ({ get: () => null, all: () => [], run: () => ({}) }), exec: () => {} },
  aliasVal: (r, k) => r[k], getTransactionSettings: () => L.settings, rowCounts: () => true, TXN_FILTER_COLUMNS: [], callClaudeForJSON: async () => null, _gpCache: new Map(), resolveDateRange: () => RANGE, dqVocab: () => ({ orderSizeLabel: 'Trip Days', orderSizeSyn: [] }), dqSavedEdges: () => null, __L: L, dmLoadSources: () => ({ manualBy: {}, digitalBy: {}, camp: {} }) };
vm.createContext(ctx2); vm.runInContext(src.slice(sa, sb) + '\n' + resolveFn + '\n' + src.slice(da, dbn), ctx2);
vm.runInContext('dqLoadTransactions = function(){ return __L; }; dqVocab = function(){ return { orderSizeLabel: "Trip Days", orderSizeSyn: [] }; }; dqSavedEdges = function(){ return null; };', ctx2);
const ask = q => vm.runInContext('dqAnswerPayload', ctx2)('acct', { text: q }, RANGE, { allowModel: false });
(async () => {
  let p = await ask('transactions by hour of day');
  const t = p.result && p.result.tables && p.result.tables[0];
  check('transactions by hour of day: 24 hours in clock order, 14:00 is the busiest', t && t.rows.length >= 24 && t.rows[0][0] === '00:00' && t.rows[23][0] === '23:00' && String(t.rows[14][1]).replace(/,/g, '') === '60', t && JSON.stringify(t.rows.slice(13, 16)));
  p = await ask('which hour had the most transactions'); check('which hour had the most transactions names 14:00', p.result && /14:00/.test(p.result.summary || ''), p.result && p.result.summary);
  p = await ask('transactions by day of the week'); const t2 = p.result && p.result.tables && p.result.tables[0];
  check('transactions by day of the week: Monday first, Sunday last', t2 && t2.rows[0][0] === 'Mon' && t2.rows[6][0] === 'Sun', t2 && JSON.stringify(t2.rows.map(r => r[0])));
  console.log(failed ? '\n' + failed + ' check(s) FAILED.' : '\nAll transaction upload checks passed.'); process.exit(failed ? 1 : 0);
})();
