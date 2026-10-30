// Build check for the data questions (Ask Verilume bar and voice assistant). Run from the backend folder:
//   node check-data-questions.js
// It loads the data-question code out of server.js, runs it over a small made-up transaction file where the answers are known,
// and exits with an error if a quarter, ranking or dashboard-parity question stops working. No database or network is used.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const a = src.indexOf('// ==== DQ BEGIN ===='), b = src.indexOf('// ==== DQ END ====');
if (a < 0 || b < 0){ console.error('FAIL: the DQ BEGIN / DQ END markers are missing from server.js'); process.exit(1); }
const sa = src.indexOf('// ==== SOT BEGIN ===='), sb = src.indexOf('// ==== SOT END ====');
const region = src.slice(sa, sb) + '\n' + src.slice(a, b);
const RANGE = { from: '2000-01-01', through: '2100-01-01', compFrom: '1999-01-01', compThrough: '1999-12-31', label: 'range', compLabel: 'prior' };
const txs = []; let id = 0;
for (let y = 2024; y <= 2026; y++) for (let m = 1; m <= 12; m++){
  if ((y === 2024 && m < 4) || (y === 2026 && m > 9)) continue;
  const base = 40 + ((m * 7 + y) % 11) * 5 + (y === 2025 && m >= 4 && m <= 6 ? 120 : 0);   // 2025 Q2 is the best quarter
  for (let i = 0; i < base; i++) txs.push({ code: 'T' + (id++), date: `${y}-${String(m).padStart(2, '0')}-10`, year: y, month: m, productGroup: ['Polar', 'Epicurean', 'Cutural'][i % 3], creativeFocus: 'A', promoType: 'x', bookingType: 'FIT', bookingStatus: 'Confirmed', guestState: 'FL', guestCountry: 'US', generation: 'Boomer', serviceDate: null, serviceYear: null, serviceMonth: null, delivered: null, deliveryStatus: '(no service date)', revenue: 1000 + (i % 7) * 100, netRevenue: 900, orderSize: 7, daySum: 7, leadDays: 100, customers: 2 });
}
const L = { txs, settings: { validStatuses: ['Confirmed'], filters: {} }, rowCount: txs.length, excludedRows: 0 };
const ctx = { createTableIfNeeded(){}, ensureColumn(){}, console, Math, Date, Map, Set, Number, String, Array, Object, JSON, RegExp, Infinity, Error, process: { env: {} },
  db: { prepare: () => ({ get: () => null, all: () => [], run: () => ({}) }), exec: () => {} },
  aliasVal: (r, k) => r[k], getTransactionSettings: () => L.settings, rowCounts: () => true, _gpCache: new Map(), isFinite, dmLoadSources: () => ({ manualBy: {}, digitalBy: {}, camp: {} }), TXN_FILTER_COLUMNS: [], callClaudeForJSON: async () => null,
  resolveDateRange: () => RANGE, dqVocab: () => ({ orderSizeLabel: 'Trip Days', orderSizeSyn: ['trip days', 'nights'] }), dqSavedEdges: () => null, __L: L };
vm.createContext(ctx);
vm.runInContext(region, ctx);
vm.runInContext('dqLoadTransactions = function(){ return __L; }; dqVocab = function(){ return { orderSizeLabel: "Trip Days", orderSizeSyn: ["trip days","nights"] }; }; dqSavedEdges = function(){ return null; }; resolveDateRange = function(){ return ' + JSON.stringify(RANGE) + '; }', ctx);
let failed = 0;
const check = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + (extra || ''))); if (!ok) failed++; };
const ask = async q => vm.runInContext('dqAnswerPayload', ctx)('acct', { text: q }, RANGE, { allowModel: false });
(async () => {
  let p = await ask('what was my best quarter for transactions');
  check('best quarter for transactions names 2025 Q2', p.result && /highest for 2025 Q2 at 580/.test(p.result.summary), p.result && p.result.summary);
  p = await ask('what was my worst quarter for transactions');
  check('worst quarter for transactions names 2024 Q4', p.result && /lowest for 2024 Q4 at 175/.test(p.result.summary), p.result && p.result.summary);
  p = await ask('which quarter had the highest revenue');
  check('highest revenue quarter names 2025 Q2', p.result && /highest for 2025 Q2/.test(p.result.summary), p.result && p.result.summary);
  p = await ask('which month had the most transactions');
  check('most transactions month names 2025-06', p.result && /highest for 2025-06 at 210/.test(p.result.summary), p.result && p.result.summary);
  p = await ask('transactions by quarter');
  check('transactions by quarter lists quarters in date order', p.result && p.result.result === undefined && p.result.tables[0].rows[0][0] === '2024 Q2', JSON.stringify(p).slice(0, 160));
  const series = vm.runInContext('dqSeriesLines', ctx)(txs).join('\n');
  check('voice context carries the best-quarter line', /BEST QUARTERS BY TRANSACTIONS \(finished quarters, highest first\): 2025 Q2 580/.test(series), series.slice(0, 300));
  const rep = await vm.runInContext('dqParityReport', ctx)('acct');
  const required = rep.filter(r => !r.optional);
  const bad = required.filter(r => r.status !== 'answers');
  check(`dashboard parity: ${required.length - bad.length} of ${required.length} required questions answered`, bad.length === 0, bad.map(r => r.question + ' -> ' + r.status + ' ' + r.detail).join('; '));
  const misunderstood = rep.filter(r => r.optional && (r.status === 'not_understood' || r.status === 'error'));
  check('dashboard parity: optional questions are understood (they may need data)', misunderstood.length === 0, misunderstood.map(r => r.question).join('; '));
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll data-question checks passed.');
  process.exit(failed ? 1 : 0);
})();
