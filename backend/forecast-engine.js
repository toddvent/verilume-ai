'use strict';
// Forecast engine (2026-09-30, "Train the Brain" — forecasting behind the
// scenes). Pure functions, no database access: server.js gathers the monthly
// series and hands them in, so the maths can be tested on its own.
//
// The chain, top to bottom:
//   impressions -> website visits -> leads -> bookings -> revenue -> ROAS
// Every rate is LEARNED from the account's own history where there is enough
// of it, and falls back to a labeled industry benchmark where there is not.
// Nothing is ever presented as learned when it is a benchmark: each stage
// carries { source, n, ... } so the caller (and the Brain) can say so.
//
// Lead -> booking uses only MATURE lead cohorts: a lead month counts only once
// month-end + max(90 days, that cohort's average days-to-convert) is in the
// past, so recent months are never scored as poor just because they are still
// converting (Todd, 2026-09-30: 90-day minimum attribution window).

const MIN_WINDOW_DAYS = 90;
// Fallbacks — the mid "Consideration" shape from the platform's own funnel
// model (impression->visit 0.8%, visit->lead 2%, lead->booking 22%). Used
// ONLY when the account has too little history for that stage.
const BENCHMARK = { visitPerImp: 0.008, leadPerVisit: 0.02, bookingPerLead: 0.22 };

function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function sum(a){ return a.reduce((x, y) => x + y, 0); }
function pct(arr, p){
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
function monthEnd(key){ const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0, 23, 59, 59)); }
function addMonths(key, n){ const [y, m] = key.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
function round(v, d){ if (v == null || !Number.isFinite(v)) return null; const f = Math.pow(10, d || 0); return Math.round(v * f) / f; }

// Ordinary least squares y = a + b x. Returns null when there is no spread in x.
function ols(xs, ys){
  const n = xs.length; if (n < 2) return null;
  const mx = sum(xs) / n, my = sum(ys) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++){ sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  if (sxx === 0) return null;
  const b = sxy / sxx, a = my - b * mx;
  let sse = 0; for (let i = 0; i < n; i++) sse += (ys[i] - (a + b * xs[i])) ** 2;
  const sd = n > 2 ? Math.sqrt(sse / (n - 2)) : Math.sqrt(sse / n);
  return { a, b, sd, r2: syy > 0 ? 1 - sse / syy : 0, n };
}

// series = {
//   impressions: {'YYYY-MM': n}, spend: {'YYYY-MM': n},
//   visits: {'YYYY-MM': n},
//   leads: { 'YYYY-MM': { total, byType: {type: {count, bookings, avgDays}} } },
//   revenue: {'YYYY-MM': n}, transactions: {'YYYY-MM': n}
// }
function calibrate(series, opts){
  const o = opts || {};
  const asOf = o.asOf instanceof Date ? o.asOf : new Date();
  const S = series || {};
  const imp = S.impressions || {}, spend = S.spend || {}, visits = S.visits || {}, leads = S.leads || {}, rev = S.revenue || {}, tx = S.transactions || {};
  const notes = [];

  // --- Stage 1: impressions -> visits (baseline + marginal) -----------------
  const vm = Object.keys(visits).filter(k => num(visits[k]) > 0 && num(imp[k]) > 0).sort();
  let s1;
  if (vm.length >= 8){
    const f = ols(vm.map(k => num(imp[k])), vm.map(k => num(visits[k])));
    if (f && f.b > 0){
      s1 = { source: 'account history (regression)', n: f.n, baseVisits: Math.max(0, f.a), visitsPerImp: f.b, sd: f.sd, r2: round(f.r2, 2) };
    }
  }
  if (!s1 && vm.length >= 3){
    const ratios = vm.map(k => num(visits[k]) / num(imp[k]));
    const med = pct(ratios, 0.5);
    const sdv = Math.sqrt(sum(ratios.map(r => (r - med) ** 2)) / ratios.length);
    s1 = { source: 'account history (ratio)', n: vm.length, baseVisits: 0, visitsPerImp: med, sd: sdv * (sum(vm.map(k => num(imp[k]))) / vm.length), r2: null };
    notes.push('Fewer than 8 months with both impressions and visits, so visits are a simple ratio to impressions with no organic baseline.');
  }
  if (!s1){ s1 = { source: 'industry benchmark', n: 0, baseVisits: 0, visitsPerImp: BENCHMARK.visitPerImp, sd: 0, r2: null }; notes.push('No months with both impressions and website visits — impression-to-visit is an industry benchmark.'); }

  // --- Stage 2: visits -> leads --------------------------------------------
  const lm = Object.keys(leads).filter(k => num(leads[k].total) > 0 && num(visits[k]) > 0).sort();
  let s2;
  if (lm.length >= 3){
    const r = lm.map(k => num(leads[k].total) / num(visits[k]));
    s2 = { source: 'account history', n: lm.length, mid: pct(r, 0.5), low: pct(r, 0.25), high: pct(r, 0.75) };
  } else { s2 = { source: 'industry benchmark', n: 0, mid: BENCHMARK.leadPerVisit, low: BENCHMARK.leadPerVisit * 0.7, high: BENCHMARK.leadPerVisit * 1.3 }; notes.push('Fewer than 3 months of leads alongside visits — visit-to-lead is an industry benchmark.'); }

  // --- Stage 3: lead -> booking, mature cohorts only ------------------------
  const typeAgg = {}; const cohortRates = []; let matureLeads = 0, matureBookings = 0, immature = 0, weightedDays = 0, dayWeight = 0;
  Object.keys(leads).sort().forEach(k => {
    const c = leads[k]; const types = c.byType || {};
    const cohortLeads = sum(Object.values(types).map(t => num(t.count)));
    const cohortDaysNum = sum(Object.values(types).map(t => num(t.avgDays) * num(t.count)));
    const cohortDays = cohortLeads > 0 ? cohortDaysNum / cohortLeads : 0;
    const hasBookings = Object.values(types).some(t => t.bookings != null);
    if (!hasBookings) return;
    const windowDays = Math.max(MIN_WINDOW_DAYS, Math.ceil(cohortDays));
    const matureAt = new Date(monthEnd(k).getTime() + windowDays * 86400000);
    if (matureAt > asOf){ immature++; return; }
    let cb = 0, cl = 0;
    Object.entries(types).forEach(([tn, t]) => {
      const cnt = num(t.count), bk = num(t.bookings);
      if (cnt <= 0) return;
      const a = typeAgg[tn] || (typeAgg[tn] = { leads: 0, bookings: 0 }); a.leads += cnt; a.bookings += bk;
      cb += bk; cl += cnt;
      if (t.avgDays != null){ weightedDays += num(t.avgDays) * cnt; dayWeight += cnt; }
    });
    if (cl > 0){ matureLeads += cl; matureBookings += cb; cohortRates.push(cb / cl); }
  });
  let s3;
  if (cohortRates.length >= 3 && matureLeads > 0){
    const mid = matureBookings / matureLeads;
    const lo = pct(cohortRates, 0.25), hi = pct(cohortRates, 0.75);
    s3 = { source: 'account history (mature cohorts)', n: cohortRates.length, mid, low: Math.min(lo, mid), high: Math.max(hi, mid), matureLeads: Math.round(matureLeads), immatureCohortsExcluded: immature };
  } else {
    s3 = { source: 'industry benchmark', n: cohortRates.length, mid: BENCHMARK.bookingPerLead, low: BENCHMARK.bookingPerLead * 0.7, high: BENCHMARK.bookingPerLead * 1.3, matureLeads: Math.round(matureLeads), immatureCohortsExcluded: immature };
    notes.push(`Only ${cohortRates.length} lead month(s) are old enough (${MIN_WINDOW_DAYS}+ days) to score lead-to-booking — using an industry benchmark for now.`);
  }
  const typeRates = {}; Object.entries(typeAgg).forEach(([tn, a]) => { if (a.leads > 0) typeRates[tn] = { rate: a.bookings / a.leads, leads: Math.round(a.leads) }; });
  // Lead-type mix over the last 6 lead months (what the next leads will look like)
  const recentKeys = Object.keys(leads).sort().slice(-6);
  const mix = {}; let mixTotal = 0;
  recentKeys.forEach(k => Object.entries(leads[k].byType || {}).forEach(([tn, t]) => { mix[tn] = (mix[tn] || 0) + num(t.count); mixTotal += num(t.count); }));
  Object.keys(mix).forEach(tn => { mix[tn] = mixTotal > 0 ? mix[tn] / mixTotal : 0; });
  const avgDays = dayWeight > 0 ? weightedDays / dayWeight : null;
  const lagMonths = avgDays != null ? Math.max(0, Math.round(avgDays / 30)) : 2;

  // --- Stage 4: bookings -> revenue (average order value) -------------------
  const tm = Object.keys(tx).filter(k => num(tx[k]) > 0 && num(rev[k]) > 0).sort();
  let s4;
  if (tm.length >= 3){
    const recent = tm.slice(-12);
    const aovs = recent.map(k => num(rev[k]) / num(tx[k]));
    s4 = { source: 'account history (last ' + recent.length + ' months)', n: recent.length, mid: sum(recent.map(k => num(rev[k]))) / sum(recent.map(k => num(tx[k]))), low: pct(aovs, 0.25), high: pct(aovs, 0.75) };
  } else { s4 = { source: 'none on file', n: 0, mid: null, low: null, high: null }; notes.push('No transaction revenue on file, so revenue and ROAS cannot be forecast.'); }

  // --- Cost side: blended CPM from recent months ----------------------------
  const cm = Object.keys(imp).filter(k => num(imp[k]) > 0 && num(spend[k]) > 0).sort().slice(-6);
  const cpm = cm.length ? (sum(cm.map(k => num(spend[k]))) / sum(cm.map(k => num(imp[k])))) * 1000 : null;

  const stageSources = [s1.source, s2.source, s3.source, s4.source];
  const learned = stageSources.filter(s => s.startsWith('account history')).length;
  const confidence = learned === 4 ? 'high' : learned >= 3 ? 'medium' : learned >= 1 ? 'low' : 'benchmark only';
  return {
    asOf: asOf.toISOString().slice(0, 10), confidence, notes,
    impressionsToVisits: s1, visitsToLeads: s2, leadsToBookings: s3, bookingsToRevenue: s4,
    leadTypeBookingRates: typeRates, leadTypeMix: mix, avgDaysToConvert: avgDays != null ? round(avgDays, 0) : null, bookingLagMonths: lagMonths,
    blendedCpm: cpm != null ? round(cpm, 2) : null, attributionWindowDays: MIN_WINDOW_DAYS
  };
}

// scenario: { months: [{ month:'YYYY-MM', impressions?, spend? }] }
//   spend without impressions is converted at the blended CPM.
function forecast(cal, scenario){
  const months = (scenario && scenario.months) || [];
  const c = cal;
  const out = []; const tot = { impressions: 0, spend: 0, visits: [0, 0, 0], leads: [0, 0, 0], bookings: [0, 0, 0], revenue: [0, 0, 0] };
  const revenueByMonth = {};
  months.forEach(m => {
    let I = num(m.impressions), $ = num(m.spend);
    if (!I && $ > 0 && c.blendedCpm) I = $ / c.blendedCpm * 1000;
    if (!$ && I > 0 && c.blendedCpm) $ = I / 1000 * c.blendedCpm;
    const s1 = c.impressionsToVisits;
    const vMid = Math.max(0, s1.baseVisits + s1.visitsPerImp * I);
    const vLow = Math.max(0, vMid - s1.sd), vHigh = vMid + s1.sd;
    const L = [vLow * c.visitsToLeads.low, vMid * c.visitsToLeads.mid, vHigh * c.visitsToLeads.high];
    const r3 = c.leadsToBookings;
    let B;
    const types = Object.keys(c.leadTypeMix || {}).filter(t => c.leadTypeBookingRates[t]);
    if (r3.source.startsWith('account history') && types.length){
      const w = t => c.leadTypeMix[t];
      const mixRate = types.reduce((a, t) => a + w(t) * c.leadTypeBookingRates[t].rate, 0) / (types.reduce((a, t) => a + w(t), 0) || 1);
      const scale = r3.mid > 0 ? mixRate / r3.mid : 1;
      B = [L[0] * r3.low * scale, L[1] * mixRate, L[2] * r3.high * scale];
    } else B = [L[0] * r3.low, L[1] * r3.mid, L[2] * r3.high];
    const aov = c.bookingsToRevenue;
    const R = aov.mid != null ? [B[0] * aov.low, B[1] * aov.mid, B[2] * aov.high] : [null, null, null];
    const row = { month: m.month || null, impressions: Math.round(I), spend: Math.round($), visits: vMid, leads: L, bookings: B, revenue: R, roas: (R[1] != null && $ > 0) ? [R[0] / $, R[1] / $, R[2] / $] : null };
    out.push(row);
    tot.impressions += I; tot.spend += $;
    [['visits', [vLow, vMid, vHigh]], ['leads', L], ['bookings', B], ['revenue', R]].forEach(([k, arr]) => { if (arr[0] != null) for (let i = 0; i < 3; i++) tot[k][i] += arr[i]; });
    if (m.month && R[1] != null){ const landing = addMonths(m.month, c.bookingLagMonths); revenueByMonth[landing] = (revenueByMonth[landing] || 0) + R[1]; }
  });
  const totals = {
    impressions: Math.round(tot.impressions), spend: Math.round(tot.spend),
    visits: tot.visits.map(v => Math.round(v)), leads: tot.leads.map(v => Math.round(v)), bookings: tot.bookings.map(v => Math.round(v)),
    revenue: c.bookingsToRevenue.mid != null ? tot.revenue.map(v => Math.round(v)) : null,
    roas: (c.bookingsToRevenue.mid != null && tot.spend > 0) ? tot.revenue.map(v => round(v / tot.spend, 2)) : null,
    costPerVisit: tot.visits[1] > 0 ? round(tot.spend / tot.visits[1], 2) : null,
    costPerLead: tot.leads[1] > 0 ? round(tot.spend / tot.leads[1], 2) : null,
    costPerBooking: tot.bookings[1] > 0 ? round(tot.spend / tot.bookings[1], 2) : null
  };
  const fmt = a => a.map(v => Math.round(v));
  return {
    confidence: c.confidence, notes: c.notes, attributionWindowDays: c.attributionWindowDays,
    bookingLagMonths: c.bookingLagMonths, revenueLandsByMonth: Object.fromEntries(Object.entries(revenueByMonth).map(([k, v]) => [k, Math.round(v)])),
    months: out.map(r => ({ month: r.month, impressions: r.impressions, spend: r.spend, visits: Math.round(r.visits), leads: fmt(r.leads), bookings: fmt(r.bookings), revenue: r.revenue[1] != null ? fmt(r.revenue) : null, roas: r.roas ? r.roas.map(v => round(v, 2)) : null })),
    totals,
    rangeNote: 'Ranges are low / expected / high; low and high assume every stage lands at its own 25th / 75th percentile together, so they are a planning band, not a statistical confidence interval.'
  };
}

// What one more million impressions does at the margin (organic baseline
// excluded), for questions like "what do 5M more impressions buy?".
function marginalPerMillion(cal){
  const f = forecast(Object.assign({}, cal, { impressionsToVisits: Object.assign({}, cal.impressionsToVisits, { baseVisits: 0, sd: 0 }) }), { months: [{ month: null, impressions: 1000000 }] });
  return { impressions: 1000000, spend: f.totals.spend, visits: f.totals.visits[1], leads: f.totals.leads, bookings: f.totals.bookings, revenue: f.totals.revenue, roas: f.totals.roas };
}

module.exports = { calibrate, forecast, marginalPerMillion, BENCHMARK, MIN_WINDOW_DAYS, _internals: { ols, pct, addMonths } };
