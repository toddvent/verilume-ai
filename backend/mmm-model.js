/* mmm-model.js — the account's own media mix model (weekly), server side only.
   Served by GET/POST /api/accounts/:id/mmm-allocations. Pure functions; no database access here.

   What it is: a regularised regression of ONE outcome (weekly revenue, transactions, leads or direct sales calls) on
   media spend per channel, after each channel's spend is passed through
     1. adstock    a(t) = spend(t) + decay * a(t-1)               (carry-over of media into later weeks)
     2. saturation h = z^s / (z^s + k^s), z = a / typical a        (diminishing returns, Hill curve)
   plus a trend and two yearly seasonal cycles as controls. Media effects are held at zero or above (a channel can
   never be shown as hurting sales by this model). Decay, half-saturation k and shape s are searched per channel.
   The last 13 weeks are held out to check the model predicts weeks it was not fitted on. Ranges come from a
   residual block bootstrap, so the page can say "between X and Y" and not only "X".

   What it is not: a controlled experiment. It reads patterns in the account's own history. Every output carries
   that caveat and a pointer to the Truth Lab for the biggest recommended moves. Gate numbers below are starting
   values, to be validated on accounts with the most history (same convention as the mix evidence levels). */
'use strict';

const GATES = {
  minWeeks: 52,            // below this nothing is fitted
  goodWeeks: 104,          // two seasonal cycles: "enough" wording
  minMeanOutcome: 8,       // mean weekly outcome (count or $/100 for revenue is NOT used; revenue uses minMeanRevenue)
  minMeanRevenue: 2000,
  minActiveWeeks: 26,      // a channel needs this many weeks with spend
  minSpendCv: 0.25,        // week-to-week variation in a channel's spend
  collinear: 0.85,         // |correlation| of two channels' weekly spend above which they cannot be separated
  holdoutWeeks: 13,
  holdoutMinR2: 0.0,       // below: model predicts no better than the average, so no recommendations
  mediumR2: 0.30,
  highR2: 0.55,
  highMape: 0.18,
  boot: 120,
  blockLen: 4,
  maxMoveDown: 0.5,        // reallocation never cuts a channel below 50% of current
  maxMoveUp: 1.5,          // ... or lifts above 150% of current
  maxVsObserved: 1.25      // ... or above 125% of the highest weekly spend ever run (no extrapolation)
};

const DECAYS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const HALF_SAT = [0.5, 1, 2];
const SHAPES = [1, 2];

/* ---------- small numeric helpers ---------- */
function mean(a){ let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
function sd(a){ const m = mean(a); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : 0; }
function corr(a, b){ const n = Math.min(a.length, b.length); if (n < 3) return 0; const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++){ const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; } return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0; }
function rngFrom(seed){ let s = (seed >>> 0) || 1; return function(){ s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hashStr(str){ let h = 2166136261; for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function quantile(sorted, q){ if (!sorted.length) return null; const p = (sorted.length - 1) * q; const lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); }

function adstock(spend, decay){ const out = new Array(spend.length); let prev = 0; for (let i = 0; i < spend.length; i++){ prev = spend[i] + decay * prev; out[i] = prev; } return out; }
function hill(z, k, s){ if (z <= 0) return 0; const zs = Math.pow(z, s); return zs / (zs + Math.pow(k, s)); }

/* ---------- weekly panel from daily series ---------- */
function weekStart(iso){ const d = new Date(iso + 'T00:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); }
function addDays(iso, n){ const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/* daily: { outcome: {'YYYY-MM-DD': n}, channels: { name: {'YYYY-MM-DD': spend} } }  ->  weekly aligned arrays.
   Weeks run Monday to Sunday. The first and last weeks are kept only when complete. */
function toWeekly(daily, opts){
  opts = opts || {};
  const days = Object.keys(daily.outcome || {}).sort();
  if (!days.length) return { weeks: [], y: [], channels: {} };
  let first = weekStart(days[0]); if (first < days[0]) first = addDays(first, 7);
  let lastDay = opts.through || days[days.length - 1];
  let last = weekStart(lastDay); if (addDays(last, 6) > lastDay) last = addDays(last, -7);
  const weeks = []; for (let w = first; w <= last; w = addDays(w, 7)) weeks.push(w);
  const idx = {}; weeks.forEach((w, i) => { idx[w] = i; });
  const y = new Array(weeks.length).fill(0);
  Object.keys(daily.outcome).forEach(d => { const i = idx[weekStart(d)]; if (i != null) y[i] += Number(daily.outcome[d]) || 0; });
  const channels = {};
  Object.keys(daily.channels || {}).forEach(name => {
    const arr = new Array(weeks.length).fill(0); const src = daily.channels[name] || {};
    Object.keys(src).forEach(d => { const i = idx[weekStart(d)]; if (i != null) arr[i] += Number(src[d]) || 0; });
    channels[name] = arr;
  });
  return { weeks, y, channels };
}

/* ---------- readiness: what the data can and cannot support, before any fitting ---------- */
function readiness(weekly, outcomeKey){
  const T = weekly.weeks.length; const out = { weeks: T, ok: true, reasons: [], channels: {}, usable: [] };
  if (T < GATES.minWeeks){ out.ok = false; out.reasons.push(`Needs at least ${GATES.minWeeks} complete weeks of daily history; this account has ${T}.`); }
  const m = mean(weekly.y); const floor = outcomeKey === 'revenue' ? GATES.minMeanRevenue : GATES.minMeanOutcome;
  if (T && m < floor){ out.ok = false; out.reasons.push(outcomeKey === 'revenue' ? `Average weekly revenue is too small to separate media from noise.` : `Only ${Math.round(m * 10) / 10} ${outcomeKey} per week on average; at least ${GATES.minMeanOutcome} are needed for a stable read.`); }
  const names = Object.keys(weekly.channels);
  names.forEach(n => {
    const s = weekly.channels[n]; const active = s.filter(v => v > 0).length; const cv = mean(s) > 0 ? sd(s) / mean(s) : 0;
    const why = [];
    if (active < GATES.minActiveWeeks) why.push(`ran in ${active} weeks; needs ${GATES.minActiveWeeks}`);
    if (cv < GATES.minSpendCv) why.push(`spend barely changes week to week (variation ${Math.round(cv * 100)}%; needs ${Math.round(GATES.minSpendCv * 100)}%), so its effect cannot be read`);
    out.channels[n] = { activeWeeks: active, spendCv: Math.round(cv * 100) / 100, usable: why.length === 0, why };
    if (!why.length) out.usable.push(n);
  });
  if (out.usable.length < 2){ out.ok = false; out.reasons.push('Needs at least two channels with enough weeks and enough week-to-week variation in spend.'); }
  // channels that move together cannot be told apart
  out.collinear = [];
  for (let i = 0; i < out.usable.length; i++) for (let j = i + 1; j < out.usable.length; j++){
    const r = corr(weekly.channels[out.usable[i]], weekly.channels[out.usable[j]]);
    if (Math.abs(r) >= GATES.collinear) out.collinear.push({ a: out.usable[i], b: out.usable[j], r: Math.round(r * 100) / 100 });
  }
  return out;
}

/* ---------- design matrix and constrained ridge ---------- */
function controlColumns(weeks){
  const T = weeks.length; const cols = [];
  const t = weeks.map((_, i) => (i - (T - 1) / 2) / Math.max(1, T / 2));
  cols.push(t);
  for (let k = 1; k <= 2; k++){
    const sn = [], cs = [];
    weeks.forEach(w => { const d = new Date(w + 'T00:00:00Z'); const doy = (d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000; const a = 2 * Math.PI * k * doy / 365.25; sn.push(Math.sin(a)); cs.push(Math.cos(a)); });
    cols.push(sn, cs);
  }
  return cols; // 5 columns, plus the intercept added in solve()
}
/* minimise ||y - X b||^2 + lamM * sum(b_media^2) + lamC * sum(b_ctrl^2), b_media >= 0; columns: [intercept, controls..., media...] */
function solve(cols, y, nCtrl, lamM, lamC, warm){
  const p = cols.length, n = y.length; const b = warm ? warm.slice() : new Array(p).fill(0);
  if (!warm) b[0] = mean(y);
  const res = new Array(n); for (let i = 0; i < n; i++){ let f = 0; for (let j = 0; j < p; j++) f += cols[j][i] * b[j]; res[i] = y[i] - f; }
  const denom = cols.map((c, j) => { let s = 0; for (let i = 0; i < n; i++) s += c[i] * c[i]; return s + (j === 0 ? 0 : (j <= nCtrl ? lamC : lamM)); });
  for (let sweep = 0; sweep < 80; sweep++){
    let delta = 0;
    for (let j = 0; j < p; j++){
      const c = cols[j]; let num = 0; for (let i = 0; i < n; i++) num += c[i] * (res[i] + c[i] * b[j]);
      let nb = denom[j] > 0 ? num / denom[j] : 0; if (j > nCtrl && nb < 0) nb = 0;
      const d = nb - b[j]; if (d !== 0){ for (let i = 0; i < n; i++) res[i] -= c[i] * d; b[j] = nb; delta = Math.max(delta, Math.abs(d)); }
    }
    if (delta < 1e-9) break;
  }
  let sse = 0; for (let i = 0; i < n; i++) sse += res[i] * res[i];
  return { b, sse };
}

function channelColumn(spendScaled, prm){
  const a = adstock(spendScaled, prm.decay);
  const out = new Array(a.length); for (let i = 0; i < a.length; i++) out[i] = hill(a[i] / prm.norm, prm.k, prm.s);
  return out;
}
function adNorm(spendScaled, decay){ const a = adstock(spendScaled, decay).filter(v => v > 0); return a.length ? mean(a) : 1; }

/* ---------- the fit ---------- */
async function fit(weekly, outcomeKey, opts){
  opts = opts || {};
  const rd = readiness(weekly, outcomeKey);
  const result = { outcome: outcomeKey, readiness: rd, fitted: false, weeksUsed: weekly.weeks.length, from: weekly.weeks[0] || null, to: weekly.weeks.length ? addDays(weekly.weeks[weekly.weeks.length - 1], 6) : null };
  if (!rd.ok) return result;

  const T = weekly.weeks.length; const names = rd.usable.slice();
  const ymean = mean(weekly.y) || 1; const y = weekly.y.map(v => v / ymean);
  const spendMean = {}; const spendS = {};
  names.forEach(n => { const nz = weekly.channels[n].filter(v => v > 0); spendMean[n] = mean(nz) || 1; spendS[n] = weekly.channels[n].map(v => v / spendMean[n]); });
  const ctrl = controlColumns(weekly.weeks); const nCtrl = ctrl.length;
  const lamM = (opts.lamM != null ? opts.lamM : 0.5), lamC = 0.05;

  // starting transform per channel, then coordinate search
  const prm = {}; names.forEach(n => { prm[n] = { decay: 0.3, k: 1, s: 1, norm: adNorm(spendS[n], 0.3) }; });
  const ones = new Array(T).fill(1);
  function build(prmSet, upto){ const cols = [ones].concat(ctrl); names.forEach(n => cols.push(channelColumn(spendS[n], prmSet[n]))); return cols; }
  function trainRange(cols, a, b){ return cols.map(c => c.slice(a, b)); }
  const holdout = Math.min(GATES.holdoutWeeks, Math.floor(T / 4));
  const trainN = T - holdout;

  function search(yv, prm0, passes, warmB){
    const p0 = {}; names.forEach(n => { p0[n] = Object.assign({}, prm0[n]); });
    let cs = build(p0); let cu = solve(cs, yv, nCtrl, lamM, lamC, warmB || null);
    for (let pass = 0; pass < passes; pass++){
      let improved = false;
      names.forEach((n, ci) => {
        let best = { sse: cu.sse, p: p0[n], sol: cu };
        DECAYS.forEach(decay => { const norm = adNorm(spendS[n], decay); HALF_SAT.forEach(k => SHAPES.forEach(s => {
          const cand = { decay, k, s, norm }; const col = channelColumn(spendS[n], cand);
          const c2 = cs.slice(); c2[1 + nCtrl + ci] = col;
          const sol = solve(c2, yv, nCtrl, lamM, lamC, cu.b);
          if (sol.sse < best.sse - 1e-9) best = { sse: sol.sse, p: cand, sol, col };
        })); });
        if (best.col){ p0[n] = best.p; cs[1 + nCtrl + ci] = best.col; cu = best.sol; improved = true; }
      });
      if (!improved) break;
    }
    return { prm: p0, cols: cs, sol: cu };
  }
  const found = search(y, prm, 3, null);
  Object.keys(found.prm).forEach(n => { prm[n] = found.prm[n]; });
  let cols = found.cols; let cur = found.sol;
  const full = solve(cols, y, nCtrl, lamM, lamC, cur.b);

  // hold-out check: same transforms, coefficients fitted on the first part only
  let hold = { weeks: holdout, r2: null, mape: null };
  if (holdout >= 8){
    const tr = solve(trainRange(cols, 0, trainN), y.slice(0, trainN), nCtrl, lamM, lamC, null);
    let sse = 0, sst = 0, ape = 0; const my = mean(y.slice(trainN));
    for (let i = trainN; i < T; i++){ let f = 0; for (let j = 0; j < cols.length; j++) f += cols[j][i] * tr.b[j]; const e = y[i] - f; sse += e * e; sst += (y[i] - my) * (y[i] - my); if (y[i] > 0) ape += Math.abs(e) / y[i]; }
    hold = { weeks: holdout, r2: sst > 0 ? Math.round((1 - sse / sst) * 100) / 100 : null, mape: Math.round(ape / holdout * 1000) / 1000 };
  }
  // in-sample fit
  let sse = 0, sst = 0; const fitted = new Array(T);
  for (let i = 0; i < T; i++){ let f = 0; for (let j = 0; j < cols.length; j++) f += cols[j][i] * full.b[j]; fitted[i] = f; sse += (y[i] - f) * (y[i] - f); sst += (y[i] - mean(y)) * (y[i] - mean(y)); }
  const r2 = sst > 0 ? 1 - sse / sst : 0;

  // block bootstrap of residuals. Each draw also re-searches decay and saturation (one warm pass), so the ranges include
  // uncertainty about the curve shape and not only about the coefficients.
  const resid = y.map((v, i) => v - fitted[i]); const rng = rngFrom(hashStr(outcomeKey + ':' + T + ':' + names.join('|')));
  const nBoot = names.length > 8 ? 40 : GATES.boot; const boots = [];
  for (let bI = 0; bI < nBoot; bI++){
    const e = []; while (e.length < T){ const st = Math.floor(rng() * Math.max(1, T - GATES.blockLen + 1)); for (let q = 0; q < GATES.blockLen && e.length < T; q++) e.push(resid[st + q]); }
    const yb = fitted.map((f, i) => Math.max(0, f + e[i])); const f2 = search(yb, prm, 1, full.b); boots.push({ prm: f2.prm, b: f2.sol.b, cols: f2.cols });
    if (opts.yield && bI % 3 === 2) await opts.yield();
  }
  const point = { prm, b: full.b, cols };
  const jOf = {}; names.forEach((n, ci) => { jOf[n] = 1 + nCtrl + ci; });
  const steadyD = (n, sp, d) => { const p = d.prm[n]; return d.b[jOf[n]] * hill((sp / spendMean[n]) / (1 - p.decay) / p.norm, p.k, p.s) * ymean; };

  /* response of each channel */
  const recent = Math.min(T, 26); const info = [];
  names.forEach((n, ci) => {
    const j = jOf[n]; const p = prm[n]; const hcol = cols[j];
    const contrib = hcol.map(h => h * full.b[j] * ymean);                   // weekly contribution in outcome units
    const total = contrib.reduce((s, v) => s + v, 0); const spendTotal = weekly.channels[n].reduce((s, v) => s + v, 0);
    const curWeekly = mean(weekly.channels[n].slice(-recent)); const maxWeekly = Math.max.apply(null, weekly.channels[n]);
    const roiOf = d => curWeekly > 0 ? steadyD(n, curWeekly, d) / curWeekly : 0;
    const dP = curWeekly * 0.1; const margOf = d => dP > 0 ? (steadyD(n, curWeekly + dP, d) - steadyD(n, curWeekly, d)) / dP : 0;
    const bootRoi = boots.map(roiOf).sort((x, y2) => x - y2); const bootMarg = boots.map(margOf).sort((x, y2) => x - y2);
    const bootShare = boots.map(d => { const col = d.cols[j]; let t2 = 0; for (let i = 0; i < col.length; i++) t2 += col[i]; return t2 * d.b[j] * ymean; }).sort((x, y2) => x - y2);
    const roiPoint = roiOf(point), margPoint = margOf(point);
    const share = curWeekly > 0 ? hill((curWeekly / spendMean[n]) / (1 - p.decay) / p.norm, p.k, p.s) : 0;   // 0..1 of this channel's own ceiling
    const curve = []; for (let m = 0; m <= 2.5001; m += 0.25){ const sp = curWeekly * m; curve.push({ spendMultiple: Math.round(m * 100) / 100, weeklySpend: Math.round(sp), weeklyOutcome: Math.round(steadyD(n, sp, point) * 100) / 100 }); }
    const ciRoi = [Math.min(quantile(bootRoi, 0.05), roiPoint), Math.max(quantile(bootRoi, 0.95), roiPoint)];   // a range always contains its own estimate
    const zero = full.b[j] <= 1e-9;
    info.push({
      channel: n, decay: p.decay, halfLifeWeeks: p.decay > 0 ? Math.round(Math.log(0.5) / Math.log(p.decay) * 10) / 10 : 0, saturationShape: p.s,
      totalSpend: Math.round(spendTotal), contribution: Math.round(total * 100) / 100, shareOfOutcome: 0, _shareRange: [quantile(bootShare, 0.05), quantile(bootShare, 0.95)],
      currentWeeklySpend: Math.round(curWeekly), outcomePerDollar: Math.round(roiPoint * 10000) / 10000, outcomePerDollarRange: ciRoi.map(v => Math.round(v * 10000) / 10000),
      marginalPerDollar: Math.round(margPoint * 10000) / 10000, marginalRange: [Math.min(quantile(bootMarg, 0.05), margPoint), Math.max(quantile(bootMarg, 0.95), margPoint)].map(v => Math.round(v * 10000) / 10000),
      ceilingUsedPct: Math.round(share * 100), curve, noEffectFound: zero, _cur: curWeekly, _max: maxWeekly, _contrib: contrib
    });
  });
  const mediaTotal = info.reduce((s, c) => s + c.contribution, 0); const outcomeTotal = weekly.y.reduce((s, v) => s + v, 0);
  info.forEach(c => { c.shareOfOutcome = outcomeTotal > 0 ? Math.round(c.contribution / outcomeTotal * 1000) / 10 : 0; const lo0 = Math.min(c._shareRange[0], c.contribution), hi0 = Math.max(c._shareRange[1], c.contribution); c.shareRange = outcomeTotal > 0 ? [lo0, hi0].map(v => Math.round(v / outcomeTotal * 1000) / 10) : [0, 0]; delete c._shareRange; });

  /* confidence: whole model, then each channel */
  const tier = (hold.r2 == null || hold.r2 < GATES.holdoutMinR2) ? 'low' : (hold.r2 >= GATES.highR2 && hold.mape != null && hold.mape <= GATES.highMape && T >= GATES.goodWeeks) ? 'high' : (hold.r2 >= GATES.mediumR2 ? 'medium' : 'low');
  info.forEach(c => {
    const rng2 = c.outcomePerDollarRange; const wide = c.outcomePerDollar > 0 ? (rng2[1] - rng2[0]) / c.outcomePerDollar : 9;
    const col = rd.collinear.filter(x => x.a === c.channel || x.b === c.channel);
    c.confidence = c.noEffectFound ? 'none' : (col.length || wide > 2.5) ? 'low' : (wide > 1.2 ? 'medium' : tier === 'high' ? 'high' : 'medium');
    c.confidenceWhy = c.noEffectFound ? 'The model found no lift tied to this channel. That can mean no effect, or too little variation to see one.' : col.length ? `Moves together with ${col.map(x => x.a === c.channel ? x.b : x.a).join(', ')} (correlation ${col[0].r}), so their effects cannot be cleanly separated.` : wide > 2.5 ? 'The plausible range is very wide.' : wide > 1.2 ? 'The plausible range is moderately wide.' : 'The plausible range is narrow.';
  });

  /* base versus media over time */
  const weeklySeries = weekly.weeks.map((w, i) => { const row = { week: w, actual: Math.round(weekly.y[i] * 100) / 100, media: 0 }; info.forEach(c => { row[c.channel] = Math.round(c._contrib[i] * 100) / 100; row.media += c._contrib[i]; }); row.media = Math.round(row.media * 100) / 100; row.base = Math.round((fitted[i] * ymean - row.media) * 100) / 100; row.fitted = Math.round(fitted[i] * ymean * 100) / 100; return row; });

  /* reallocation: equalise marginal return inside guard rails */
  const eligible = info.filter(c => !c.noEffectFound && c._cur > 0);
  let realloc = null;
  if (eligible.length >= 2 && tier !== 'low'){
    const budget = eligible.reduce((s, c) => s + c._cur, 0);
    const lo = {}, hi = {}, x = {};
    eligible.forEach(c => { lo[c.channel] = c._cur * GATES.maxMoveDown; hi[c.channel] = Math.min(c._cur * GATES.maxMoveUp, c._max * GATES.maxVsObserved); if (hi[c.channel] < c._cur) hi[c.channel] = c._cur; if (c.confidence === 'low'){ lo[c.channel] = c._cur; hi[c.channel] = c._cur; } x[c.channel] = lo[c.channel]; });
    let left = budget - eligible.reduce((s, c) => s + lo[c.channel], 0); const step = budget / 400;
    let guard = 0;
    while (left > step * 0.5 && guard++ < 2000){
      let bestC = null, bestG = -1;
      eligible.forEach(c => { if (x[c.channel] + step > hi[c.channel] + 1e-9) return; const g = steadyD(c.channel, x[c.channel] + step, point) - steadyD(c.channel, x[c.channel], point); if (g > bestG){ bestG = g; bestC = c; } });
      if (!bestC) break; x[bestC.channel] += step; left -= step;
    }
    const nowOut = eligible.reduce((s, c) => s + steadyD(c.channel, c._cur, point), 0), newOut = eligible.reduce((s, c) => s + steadyD(c.channel, x[c.channel], point), 0);
    const lifts = boots.map(d => { let a = 0, e2 = 0; eligible.forEach(c => { a += steadyD(c.channel, c._cur, d); e2 += steadyD(c.channel, x[c.channel], d); }); return e2 - a; }).sort((p, q) => p - q);
    const lo5 = Math.min(quantile(lifts, 0.05), newOut - nowOut), hi95 = Math.max(quantile(lifts, 0.95), newOut - nowOut);
    const weeklyTotalNow = mean(weekly.y.slice(-recent));   // all outcome, media and base, so the percentage is not inflated by a small media share
    realloc = {
      weeklyBudget: Math.round(budget), guardRails: `No channel goes below ${Math.round(GATES.maxMoveDown * 100)}% or above ${Math.round(GATES.maxMoveUp * 100)}% of its recent spend, or above ${Math.round(GATES.maxVsObserved * 100)}% of the most it has ever run in a week.`,
      rows: eligible.map(c => ({ channel: c.channel, currentWeekly: Math.round(c._cur), recommendedWeekly: Math.round(x[c.channel]), changePct: c._cur > 0 ? Math.round((x[c.channel] / c._cur - 1) * 100) : 0, confidence: c.confidence, held: c.confidence === 'low' })),
      weeklyOutcomeRecent: Math.round(weeklyTotalNow * 100) / 100,
      liftPerWeek: Math.round((newOut - nowOut) * 100) / 100, liftRange: [Math.round(lo5 * 100) / 100, Math.round(hi95 * 100) / 100],
      liftPct: weeklyTotalNow > 0 ? Math.round((newOut - nowOut) / weeklyTotalNow * 1000) / 10 : 0,
      liftPctRange: weeklyTotalNow > 0 ? [Math.round(lo5 / weeklyTotalNow * 1000) / 10, Math.round(hi95 / weeklyTotalNow * 1000) / 10] : [0, 0],
      distinguishable: lo5 > 0,
      note: lo5 > 0 ? 'Even at the low end of the range the move is expected to help.' : 'The range includes no change, so treat this as a direction to test, not a result.',
      testFirst: eligible.map(c => ({ channel: c.channel, pct: Math.abs(x[c.channel] / c._cur - 1) })).filter(r => r.pct >= 0.2).map(r => r.channel)
    };
  }

  info.forEach(c => { delete c._contrib; c.currentWeeklySpendMax = Math.round(c._max); delete c._cur; delete c._max; });
  Object.assign(result, {
    fitted: true, confidence: tier, rSquared: Math.round(r2 * 100) / 100, holdout: hold, channels: info, series: weeklySeries,
    mediaShare: outcomeTotal > 0 ? Math.round(mediaTotal / outcomeTotal * 1000) / 10 : 0, baseShare: outcomeTotal > 0 ? Math.round((1 - mediaTotal / outcomeTotal) * 1000) / 10 : 0,
    realloc,
    notRun: Object.keys(rd.channels).filter(n => !rd.channels[n].usable).map(n => ({ channel: n, why: rd.channels[n].why }))
  });
  return result;
}

module.exports = { fit, readiness, toWeekly, weekStart, addDays, GATES, _internals: { adstock, hill, solve, corr } };
