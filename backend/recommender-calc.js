/* GENERATED once by build-calc.js from portal.html, then maintained by hand — the portal no longer holds this logic. The funnel
   seed: stage by industry conversion rates, direct-purchase mix, measured high-value conversion. Called by POST /api/app/recommend (fn "funnelSeed"). */
'use strict';
module.exports = function makeCalc(env){
  env = env || {};
  const st = env.state || {};
  const state = { industry: st.industry || null, companyId: st.companyId || null };
  const cmpLeadPoolEconomicsCache = env.cmpLeadPoolEconomicsCache || null;
  const FUNNEL_CONVERSION_BY_STAGE = {
    Awareness:     { visitRate: 0.004, leadRate: 0.010, bookingRate: 0.15 },
    Consideration: { visitRate: 0.008, leadRate: 0.020, bookingRate: 0.22 },
    Purchase:      { visitRate: 0.020, leadRate: 0.025, bookingRate: 0.30 },
    Loyalty:       { visitRate: 0.015, leadRate: 0.040, bookingRate: 0.40 },
    Advocacy:      { visitRate: 0.010, leadRate: 0.030, bookingRate: 0.25 }
  };
  const DEFAULT_FUNNEL_CONVERSION = { visitRate: 0.010, leadRate: 0.020, bookingRate: 0.25 };
  const REGISTRATION_RATE_BY_STAGE = { Awareness: 0.020, Consideration: 0.030, Purchase: 0.040, Loyalty: 0.060, Advocacy: 0.050 };
  const DEFAULT_REGISTRATION_RATE = 0.030;
  const STANDALONE_INDUSTRY_FUNNEL_MULTIPLIER = {
    'Automotive Sales & Service': { visit: 1.0, lead: 1.0, booking: 0.91 }, // FPS: Automotive — unchanged
    'Financial Services / Banking': { visit: 1.0, lead: 1.0, booking: 0.99 }, // FPS: Financial Services — unchanged
    'Insurance': { visit: 1.0, lead: 1.0, booking: 0.97 } // FPS: Business Insurance — unchanged; still the only source found, still excluded from a channel-mix override per the 2018-data decision above
  };
  const INDUSTRY_CLUSTER = {
    'Healthcare — Outpatient / Clinics': 'elective-healthcare',
    'Healthcare — Hospitals & Systems': 'elective-healthcare', // imperfect fit (hospitals/systems care isn't really "elective"), but this is the only healthcare research vertical on file — flagged here rather than silently folded in
    'Home Services / Contractors': 'home-services',
    'Hotels / Hospitality': 'travel-cruise',
    'Travel / Tourism': 'travel-cruise',
    'Cruise Lines — Luxury': 'travel-cruise',
    'Cruise Lines — Mass Market': 'travel-cruise',
    'Real Estate': 'real-estate'
  };
  function industryCluster(industryLabel){
    return INDUSTRY_CLUSTER[industryLabel] || 'generic';
  }
  const CLUSTER_FUNNEL_MULTIPLIER = {
    'elective-healthcare': { visit: 1.0, lead: 1.0, booking: 0.95 }, // FPS: Healthcare (Outpatient/Clinics figure) — Hospitals & Systems' extra dampening (0.85) dropped in favor of one shared cluster number; edit per-campaign if a hospital-system account needs it
    'travel-cruise': { visit: 1.0, lead: 1.0, booking: 1.12 }, // FPS: Hotels & Resorts, the actual sourced proxy for this cluster — the old cruise-specific extra dampening (Luxury 0.78 / Mass Market 1.06) is dropped from THIS multiplier; INDUSTRY_CYCLE_MULTIPLIER (Transaction Window) still captures cruise's longer sales cycle through a separate, disclosed mechanism
    'real-estate': { visit: 1.0, lead: 1.0, booking: 0.99 }, // FPS: Real Estate — unchanged, single industry, matches this file's own INDUSTRY_CYCLE_MULTIPLIER=6
    'home-services': { visit: 1.0, lead: 1.0, booking: 1.01 }, // FPS: Construction — unchanged, single industry
    'generic': { visit: 1.0, lead: 1.0, booking: 1.0 } // no dedicated research vertical for this group (Restaurants, Retail, Grocery, Fitness, Salons, Professional Services, Education, Entertainment, Sporting Goods, Wine & Spirits, Telecom, E-commerce, Nonprofit, Other, and anything not listed) — no adjustment, rather than the individually-flavored FPS proxies this group used to carry
  };
  function getIndustryFunnelMultiplier(){
    if (state.industry && STANDALONE_INDUSTRY_FUNNEL_MULTIPLIER[state.industry]) return STANDALONE_INDUSTRY_FUNNEL_MULTIPLIER[state.industry];
    return CLUSTER_FUNNEL_MULTIPLIER[industryCluster(state.industry)] || CLUSTER_FUNNEL_MULTIPLIER.generic;
  }
  const INDUSTRY_ECOMMERCE_MIX = {
    'Quick-Service / Limited-Service Restaurants': 0.70, // online/app ordering skips a lead step for most orders
    'Full-Service Dining': 0.35, // reservation platforms are semi-direct; some still call/inquire
    'Hotels / Hospitality': 0.55, // many book direct online; longer/group stays still route through inquiries
    'Retail — General Merchandise': 0.85,
    'Retail — Furniture & Home': 0.35, // showroom-driven; most buyers still visit or call before buying
    'Retail — Specialty / Apparel': 0.85,
    'Grocery / Supermarkets': 0.90,
    'Automotive Sales & Service': 0.10, // vehicle purchase overwhelmingly routes through a lead/test-drive first
    'Healthcare — Outpatient / Clinics': 0.10, // appointment requests are effectively leads
    'Healthcare — Hospitals & Systems': 0.05,
    'Financial Services / Banking': 0.15, // account opening can be direct, but most product lines still qualify a lead first
    'Insurance': 0.10, // quote requests function as leads even when "instant"
    'Real Estate': 0.02, // almost always a lead (inquiry/tour request) before any transaction
    'Fitness / Gyms & Studios': 0.30, // some direct online sign-up, but tour/consult-first is still common
    'Salons / Spas / Personal Care': 0.55, // online booking is increasingly the default, but many still call/inquire
    'Home Services / Contractors': 0.05, // quote/estimate request is a lead almost by definition
    'Professional Services (B2B)': 0.03,
    'Education / Training': 0.08, // enrollment inquiries function as leads
    'Entertainment / Attractions': 0.85, // ticket purchases are overwhelmingly direct
    'Travel / Tourism': 0.45,
    'Cruise Lines — Luxury': 0.10, // high-touch, agent/consult-driven purchase path
    'Cruise Lines — Mass Market': 0.35,
    'Sporting Goods Retail': 0.85,
    'Wine & Spirits / Winery': 0.75,
    'Telecom / Wireless Retail': 0.30, // plan changes can be self-serve, but new lines/upgrades often route through a rep lead
    'E-commerce / DTC Brand': 0.92, // the direct-purchase category this table exists for
    'Nonprofit / Association': 0.20 // one-time donations are often direct; membership/major-gift asks route through a lead
    // 'Other / Not listed' and any industry not in this table intentionally
    // fall back to 0 (no blend, same as before this fix) below.
  };
  function getIndustryEcommerceMix(){
    const v = state.industry && INDUSTRY_ECOMMERCE_MIX[state.industry];
    return (typeof v === 'number') ? v : 0;
  }
  const DIRECT_PURCHASE_RATE_BY_STAGE = {
    Awareness:     0.006,
    Consideration: 0.014,
    Purchase:      0.030,
    Loyalty:       0.038,
    Advocacy:      0.022
  };
  const DEFAULT_DIRECT_PURCHASE_RATE = 0.015;
  function cmpClampRate(rate, min, max){ return Math.max(min, Math.min(max, rate)); }
  function cmpMeasuredHighValueConversion(){
    const pe = cmpLeadPoolEconomicsCache && cmpLeadPoolEconomicsCache.accountId === state.companyId ? cmpLeadPoolEconomicsCache.economics : null;
    const hv = pe && Array.isArray(pe.pools) ? pe.pools.find(x => x.leadType === 'High Value') : null;
    return hv && hv.conversionRate != null && hv.leads >= 50 ? hv : null; // ≥50 mature leads before it outranks the seed
  }
  function cmpStageIndustryFunnelSeed(stage){
    const base = (stage && FUNNEL_CONVERSION_BY_STAGE[stage]) || DEFAULT_FUNNEL_CONVERSION;
    const mult = getIndustryFunnelMultiplier();
    const measuredHv = cmpMeasuredHighValueConversion();
    // Round 132ao (2026-08-12) follow-up — direct-purchase rate reuses the
    // same booking-stage table/multiplier shape as the Lead path's booking
    // rate (both represent "how good is this stage/industry at converting
    // once someone's already engaged"), just against DIRECT_PURCHASE_RATE_BY_STAGE's
    // own, notably higher, base values instead of FUNNEL_CONVERSION_BY_STAGE's.
    const directBase = (stage && DIRECT_PURCHASE_RATE_BY_STAGE[stage]) || DEFAULT_DIRECT_PURCHASE_RATE;
    return {
      visitRate: cmpClampRate(base.visitRate * mult.visit, 0.0005, 0.06),
      leadRate: cmpClampRate(base.leadRate * mult.lead, 0.003, 0.20),
      bookingRate: measuredHv ? cmpClampRate(measuredHv.conversionRate, 0.005, 0.8) : cmpClampRate(base.bookingRate * mult.booking, 0.05, 0.65),
      bookingRateSource: measuredHv ? `measured: ${Math.round(measuredHv.bookings).toLocaleString()} bookings from ${Math.round(measuredHv.leads).toLocaleString()} High Value leads over ${measuredHv.matureMonths} mature month${measuredHv.matureMonths === 1 ? '' : 's'}` : 'stage × industry seed',
      directPurchaseRate: cmpClampRate(directBase * mult.booking, 0.002, 0.08),
      // 2026-09-28 — see REGISTRATION_RATE_BY_STAGE.
      registrationRate: cmpClampRate(((stage && REGISTRATION_RATE_BY_STAGE[stage]) || DEFAULT_REGISTRATION_RATE) * mult.lead, 0.005, 0.25),
      ecommerceMix: getIndustryEcommerceMix()
    };
  }
  function funnelSeed(stage){
    const seed = cmpStageIndustryFunnelSeed(stage || null);
    const hasEcommerceMix = !!(state.industry && typeof INDUSTRY_ECOMMERCE_MIX[state.industry] === 'number');
    const hasIndustryFunnel = !!(state.industry && (STANDALONE_INDUSTRY_FUNNEL_MULTIPLIER[state.industry] || industryCluster(state.industry) !== 'generic'));
    return Object.assign({}, seed, { hasEcommerceMix, hasIndustryFunnel });
  }
  return { funnelSeed };
};
