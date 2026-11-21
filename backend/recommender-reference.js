/* Reference tables (channel best practices, objective / media-mix / measurement guidance, copy-length rules, ad unit sizes), served one entry at a time by
   POST /api/app/recommend (fn 'reference'). Maintained by hand; the portal no longer holds them. */
const CHANNEL_BEST_PRACTICES = {
  'Search': {
    primaryMetrics: ['CTR', 'CPC', 'CPA', 'Quality Score'],
    benchmarks: [
      { metric: 'CTR', range: '1.5% – 3.5%', source: 'Google Ads industry benchmark reports' },
      { metric: 'Conversion rate', range: '3% – 6%', source: 'Google Ads industry benchmark reports' }
    ],
    conversionRateBenchmark: [0.03, 0.06],
    metricLabels: { impressions: 'Impressions', conversions: 'Conversions', costPerConversion: 'Cost per conversion (CPA)' },
    objectiveModifier: {
      Awareness: 'Search is usually a weaker awareness channel — it captures existing demand more than it creates new demand. Weight impression share over CPA here.',
      Consideration: 'CTR and CPC become the leading indicators as people actively research.',
      Purchase: 'CPA/ROAS is the whole game at this stage — Quality Score matters mainly as a lever to bring CPA down.',
      Loyalty: 'Branded-term defense — CPA should run very low since intent is already high.'
    },
    creativeGuidance: 'Match ad copy to query intent for the stage — broad benefit-led copy for Awareness/Consideration, a specific offer + strong CTA for Purchase.',
    testingNote: 'The easiest channel here to A/B directly — native platform split-testing works even at small budgets.'
  },
  'Social': {
    primaryMetrics: ['Engagement rate', 'CPM', 'CPA', 'Video view-through'],
    benchmarks: [
      { metric: 'Engagement rate', range: '0.5% – 3%', source: 'Meta/industry paid-social benchmark reports' },
      { metric: 'Conversion rate', range: '0.9% – 1.5%', source: 'Meta/industry paid-social benchmark reports' }
    ],
    conversionRateBenchmark: [0.009, 0.015],
    metricLabels: { impressions: 'Impressions', conversions: 'Conversions', costPerConversion: 'Cost per conversion' },
    objectiveModifier: {
      Awareness: 'Weight reach/frequency and engagement rate over CPA.',
      Consideration: 'Click-through to a landing experience and video view-through matter most.',
      Purchase: 'CPA and on-platform conversion rate are the leading numbers.',
      Loyalty: 'Retargeting past customers — expect a materially lower CPA than cold prospecting.',
      Advocacy: 'Track shares/referrals and UGC volume alongside the usual paid metrics.'
    },
    creativeGuidance: 'Native, platform-first creative outperforms repurposed assets — vertical video and short-form content especially.',
    testingNote: 'Native split-testing tools make this easy to test even at small budgets; watch for audience overlap between test cells.'
  },
  'Display': {
    primaryMetrics: ['CTR', 'Viewability', 'CPM'],
    benchmarks: [
      { metric: 'CTR', range: '0.05% – 0.3%', source: 'Google Display Network / industry benchmark reports' }
    ],
    conversionRateBenchmark: null,
    metricLabels: { impressions: 'Impressions', conversions: 'Click-throughs', costPerConversion: 'Cost per click-through' },
    objectiveModifier: {
      Awareness: 'This is Display’s natural stage — judge it on reach and viewability, not CTR.',
      Consideration: 'Retargeting display (site visitors, cart abandoners) should meaningfully outperform cold prospecting display.'
    },
    creativeGuidance: 'CTR benchmarks here are intentionally low industry-wide — don’t judge Display like Search. Frequency capping matters more than creative count.',
    testingNote: 'Best tested via holdout (exposed vs. unexposed) for brand-lift, since raw CTR understates its actual effect.'
  },
  'Video': {
    primaryMetrics: ['View-through rate', 'Completion rate', 'CPV'],
    benchmarks: [
      { metric: 'View-through rate', range: '10% – 30%', source: 'Platform (YouTube/Meta) video benchmark reports' }
    ],
    conversionRateBenchmark: null,
    metricLabels: { impressions: 'Views', conversions: 'Completions / click-throughs', costPerConversion: 'Cost per completion' },
    objectiveModifier: {
      Awareness: 'Completion rate and reach are the leading signals.',
      Consideration: 'Click-through to a landing experience after the view matters more than completion alone.'
    },
    creativeGuidance: 'Front-load the message — most drop-off happens in the first 5 seconds on skippable formats.',
    testingNote: 'Test hook/first-5-seconds variants first; completion rate is the fastest read before spending on full-funnel metrics.'
  },
  'Email': {
    primaryMetrics: ['Open rate', 'CTR', 'Conversion rate', 'Unsubscribe rate'],
    benchmarks: [
      { metric: 'Open rate', range: '20% – 35%', source: 'Mailchimp / Campaign Monitor email benchmark reports' },
      { metric: 'Conversion rate', range: '1% – 5%', source: 'Mailchimp / Campaign Monitor email benchmark reports' }
    ],
    conversionRateBenchmark: [0.01, 0.05],
    metricLabels: { impressions: 'Emails sent', conversions: 'Conversions', costPerConversion: 'Cost per conversion' },
    objectiveModifier: {
      Loyalty: 'This is usually the primary Loyalty-stage channel — list/segment quality (which of the account’s contact lists this campaign targets) drives results as much as creative does.',
      Purchase: 'Subject line + send-time testing typically move conversion rate more than body-copy changes.'
    },
    creativeGuidance: 'One clear CTA per email; segment-specific send lists (this campaign’s targeted contact lists) matter more here than almost any other channel.',
    testingNote: 'Cheapest channel in the library to test — subject line, send time, and offer are all fast, low-cost A/B splits.'
  },
  'PR/Earned': {
    primaryMetrics: ['Placements/mentions', 'Estimated reach', 'Sentiment'],
    benchmarks: [],
    conversionRateBenchmark: null,
    metricLabels: { impressions: 'Estimated reach', conversions: null, costPerConversion: null },
    objectiveModifier: {
      Awareness: 'Earned media is almost exclusively an Awareness-stage tool — don’t force a conversion metric onto it.'
    },
    creativeGuidance: 'A strong media list and a genuinely newsworthy angle matter more than polish — earned coverage isn’t bought, it’s pitched.',
    testingNote: 'Not A/B-testable in the usual sense — the closest equivalent is testing pitch angles across similar outlets over time.'
  },
  'Linear': {
    primaryMetrics: ['GRPs/reach', 'Frequency', 'Brand lift'],
    benchmarks: [],
    conversionRateBenchmark: null,
    metricLabels: { impressions: 'GRPs / estimated reach', conversions: null, costPerConversion: null },
    objectiveModifier: {
      Awareness: 'Almost always an Awareness-stage buy — attribution is inherently indirect.'
    },
    creativeGuidance: '15/30-second spots need the brand and offer established in the first few seconds — most viewers aren’t watching for the whole spot.',
    testingNote: 'Can’t be click-tracked directly — a geo/matched-market holdout is the honest way to measure incremental lift (see the budget-based testing guidance below).'
  },
  'Direct Mail': {
    primaryMetrics: ['Response rate', 'Cost per response', 'Cost per acquisition'],
    benchmarks: [
      { metric: 'Response rate — house list', range: '4% – 9%', source: 'DMA Response Rate Report' },
      { metric: 'Response rate — prospect/cold list', range: '0.5% – 2%', source: 'DMA Response Rate Report' }
    ],
    conversionRateBenchmark: [0.005, 0.09],
    metricLabels: { impressions: 'Pieces mailed', conversions: 'Coded responses', costPerConversion: 'Cost per response' },
    objectiveModifier: {
      Loyalty: 'House-list mailings (past customers) should land at the high end of the response range — if not, the offer or list hygiene is worth checking before the channel itself.',
      Purchase: 'Cold/prospect-list response will run well below house-list — don’t judge the two lists by the same bar.'
    },
    creativeGuidance: 'A trackable offer code or dedicated URL/QR is mandatory — the tracking-link builder on the Ad Trafficking card is exactly this mechanism.',
    testingNote: 'Test list segment and offer, not just creative — list quality usually swings response rate more than the piece’s design.'
  },
  'Events': {
    primaryMetrics: ['Leads generated', 'Cost per lead', 'Attendee-to-opportunity rate'],
    benchmarks: [
      { metric: 'Attendee-to-lead conversion', range: '20% – 40%', source: 'Industry event-marketing benchmark reports' }
    ],
    conversionRateBenchmark: [0.20, 0.40],
    metricLabels: { impressions: 'Attendees', conversions: 'Leads/opportunities', costPerConversion: 'Cost per lead' },
    objectiveModifier: {
      Advocacy: 'For a consumer/hospitality account, events skew Loyalty/Advocacy (rewarding existing customers) rather than top-of-funnel lead gen.',
      Consideration: 'For a B2B-style account, events skew Consideration/Purchase — track opportunity rate, not just attendance.'
    },
    creativeGuidance: 'A clear, low-friction lead-capture mechanism at the event matters more than the event collateral itself.',
    testingNote: 'Hard to A/B in the usual sense — compare event-to-event (same format, different execution) rather than splitting a single event.'
  },
  'Podcasts': {
    primaryMetrics: ['Promo-code redemptions', 'Listens/downloads', 'Cost per acquisition'],
    benchmarks: [
      { metric: 'Promo-code redemption rate', range: '0.5% – 2%', source: 'Podcast advertising industry benchmark reports' }
    ],
    conversionRateBenchmark: [0.005, 0.02],
    metricLabels: { impressions: 'Estimated listens', conversions: 'Promo-code redemptions', costPerConversion: 'Cost per acquisition' },
    objectiveModifier: {
      Consideration: 'Host-read ads meaningfully outperform programmatic drop-ins — factor that into which shows get the budget.'
    },
    creativeGuidance: 'A unique, easy-to-say promo code per show is the only reliable way to attribute response — ties directly into the tracking-link builder.',
    testingNote: 'Test show/host, not just script — response varies more by host trust than by copy in this channel.'
  },
  'Radio': {
    primaryMetrics: ['Reach/frequency', 'Response rate (via promo code)'],
    benchmarks: [],
    conversionRateBenchmark: null,
    metricLabels: { impressions: 'Estimated reach', conversions: 'Promo-code responses', costPerConversion: 'Cost per response' },
    objectiveModifier: {
      Awareness: 'Reach/frequency (RAB-style benchmarks) is the primary read, not response rate, unless every spot carries a trackable offer.'
    },
    creativeGuidance: 'Repeat the offer and call-to-action at least twice per spot — radio has no visual reference to fall back on.',
    testingNote: 'Same attribution gap as Linear — a geo/matched-market holdout is the honest measurement approach, not a raw response count alone.'
  },
  'Magazines': {
    primaryMetrics: ['Reach', 'CPM', 'Response rate (if coded)'],
    benchmarks: [
      { metric: 'Coded response rate', range: '0.1% – 0.5%', source: 'DMA Response Rate Report (print benchmark)' }
    ],
    conversionRateBenchmark: [0.001, 0.005],
    metricLabels: { impressions: 'Estimated reach', conversions: 'Coded responses', costPerConversion: 'Cost per response' },
    objectiveModifier: {
      Awareness: 'Response can trail the insertion date by weeks — don’t judge a magazine buy on the same timeline as a digital channel.'
    },
    creativeGuidance: 'A dedicated URL/QR or offer code per publication is what makes the Channel Performance comparison in a later round possible — without one, this placement’s response is unmeasurable.',
    testingNote: 'Compare publication to publication (see the Channel Performance leaderboard) rather than A/B within a single issue.'
  }
};

const OBJECTIVE_BEST_PRACTICES = {
  'Brand Awareness': 'Awareness campaigns need reach and consistent creative more than precision targeting — the risk here is a message that doesn’t survive repeat exposure, not wasted spend. Check the Awareness-stage cells in Continuous Monitoring first: pushing reach into a market where Creative Visuals or Search Everywhere already reads weak usually shows up as Impressions or Reach forecasting fine on paper with no Brand Lift or Social Reach follow-through (reported on, not forecastable here).',
  'Consideration': 'Consideration campaigns succeed on whether the audience actually evaluates the offer, not just sees it — Clicks only convert into real evaluation when the landing experience and creative genuinely educate, not just interrupt (Engagement Rate/CTR and Video Completion Rate are the reported-on performance read on how well that\'s working). Check the Consideration-stage cells first: driving clicks into a weak Product Info or Search Everywhere cell shows up as traffic with no downstream leads.',
  'Purchase / Conversion': 'Purchase/Conversion campaigns live or die at the transactional handoff — the CTA has to land on an experience (checkout, booking flow, or a sales team) that can actually close what the media promised. A strong ad into a weak Purchase-stage cell is the most common way Transactions underperform even with the right offer — Conversion Rate (CVR) and CPA/ROAS are the reported-on performance metrics that show why.',
  'Brand Loyalty': 'Loyalty-focused work assumes Loyalty is already scoring reasonably well in Continuous Monitoring — otherwise the campaign is asking customers to come back to an experience that hasn’t earned it yet. Forecast this objective on Transactions (repeat business); Repeat Purchase Rate, LTV, and Churn/Retention are the reported-on metrics that explain whether it\'s working, and this objective tends to perform best paired with a Product Delivery or POS/Team fix, not as a stand-alone message.',
  'Brand Advocacy': 'Advocacy leans hardest on Advocacy-stage cells and Search Everywhere — most referral, review, and UGC activity now surfaces through reviews, local search, and AI answer engines rather than owned channels. Forecast this objective on Leads (referral sign-ups); NPS, Referral Revenue/Sign-ups, UGC & Reviews, and Advocate Share Rate are the reported-on metrics that depend on customers who already had a good enough experience to talk about it.'
};

const MEDIA_MIX_BEST_PRACTICES = {
  'Awareness': 'Awareness media mix should weight toward high-reach, low-friction formats — social video, connected TV, and programmatic display — with Search Everywhere (SEO/AEO/GEO) running in parallel so the demand reach creates has somewhere to land. Avoid concentrating spend in a single channel; frequency across two or three channels outperforms saturation in one.',
  'Consideration': 'Consideration-stage mix should lean on retargeting, comparison-driven search, and email/CRM nurture — channels that let a prospect self-pace through evaluation. Paid social here works best carrying proof (reviews, before/after, specific detail) rather than the broad-reach creative used at Awareness.',
  'Purchase': 'Purchase-stage mix is about removing friction at the moment of decision — paid search on high-intent terms, retargeting cart/booking abandonment, and any channel that hands off directly into the call center, POS, or booking flow. A weak operational handoff shows up fastest here, so confirm that path is solid before scaling spend.',
  'Loyalty': 'Loyalty-stage mix shifts to owned channels — email, SMS, app/loyalty program — supplemented by lightweight paid social to stay visible between visits. Paid reach matters less here than message relevance and timing.',
  'Advocacy': 'Advocacy-stage mix should prioritize channels that surface and amplify existing customers’ voices — reviews platforms, referral programs, and organic/earned social — over paid reach. This is also where Search Everywhere (AEO/GEO) findability compounds: strong advocacy signal is what AI answer engines and review-driven local search actually surface.'
};

const MEASUREMENT_BEST_PRACTICES = {
  'eCommerce': 'For an eCommerce brand, measure this campaign against tracked online conversions and revenue — ROAS, cost per purchase, and add-to-cart-to-purchase rate — with UTM-tagged links on every asset so spend ties back to actual transactions, not just clicks.',
  'Call Center': 'For a call-center-driven brand, measure against tracked/booked calls, not just clicks — use a call-tracking number per channel and record booked-call rate and average handle time as the real conversion signal, since a strong ad into a weak call handoff will still look like it "worked" on clicks alone.',
  'Storefront': 'For a storefront brand, measure against in-store visits and POS-attributed sales where available — foot-traffic lift during the flight window, redemption rate on any in-store offer, and location-based attribution tying ad exposure to a visit, if available.'
};

const COPY_BEST_PRACTICE_BY_TREATMENT = {
  short: { maxChars: 60, fontSize: '28–40pt headline · 18pt minimum body', fontSizeOlder: '36–48pt headline · 24pt minimum body', notes: 'One idea, legible at a glance or from a distance (OOH/transit/social) — cut anything that isn\'t the headline.' },
  medium: { maxChars: 250, fontSize: '20–28pt headline · 12pt minimum body', fontSizeOlder: '24–32pt headline · 14pt minimum body', notes: 'A headline plus 1–2 supporting lines — room for one proof point, not the full story.' },
  long: { maxChars: 1200, fontSize: '16–20pt headline · 10pt minimum body', fontSizeOlder: '18–24pt headline · 12pt minimum body', notes: 'Full narrative space (landing page/email/press release) — still break it into short, scannable paragraphs.' }
};

const AD_UNIT_SPECS = {
  'Linear TV': [{ label: ':15 Spot (16:9)', ratio: 16/9, hasImage: true, frames: 3 }, { label: ':30 Spot (16:9)', ratio: 16/9, hasImage: true, frames: 3 }],
  'OTV': [{ label: ':15 Spot (16:9)', ratio: 16/9, hasImage: true, frames: 3 }, { label: ':30 Spot (16:9)', ratio: 16/9, hasImage: true, frames: 3 }],
  'CTV': [{ label: ':15 Spot (16:9)', ratio: 16/9, hasImage: true, frames: 3 }, { label: ':30 Spot (16:9)', ratio: 16/9, hasImage: true, frames: 3 }],
  'Paid Social': [
    { label: 'Lead Form Card (1200×628)', ratio: 1200/628, hasImage: true, formats: ['Lead form ad'] },
    { label: 'Lead Form Square Card (1080×1080)', ratio: 1, hasImage: true, formats: ['Lead form ad'] },
    { label: 'Feed Square (1080×1080)', ratio: 1, hasImage: true, formats: ['Feed post'] },
    { label: 'Feed Portrait (1080×1350)', ratio: 1080/1350, hasImage: true, formats: ['Feed post'] },
    { label: 'Feed Landscape (1200×628)', ratio: 1200/628, hasImage: true, formats: ['Feed post'] },
    { label: 'Story / Reel (1080×1920, animated)', ratio: 1080/1920, hasImage: true, frames: 3, formats: ['Story / Reel'] },
    { label: 'Carousel Card (1080×1080, 3 cards)', ratio: 1, hasImage: true, frames: 3, formats: ['Carousel'] },
    { label: 'Click-to-Message (1080×1080)', ratio: 1, hasImage: true, formats: ['Click-to-message ad'] },
    { label: 'Click-to-Message Story (1080×1920)', ratio: 1080/1920, hasImage: true, formats: ['Click-to-message ad'] }
  ],
  'Brand Search': [
    { label: 'Responsive Search Ad (headlines + descriptions)', ratio: 3/1, hasImage: false, formats: ['Responsive search ad'] },
    { label: 'Expanded Text Ad', ratio: 3/1, hasImage: false, formats: ['Responsive search ad'] },
    { label: 'Call-Only Ad', ratio: 3/1, hasImage: false, formats: ['Call-only ad'] },
    { label: 'Performance Max Landscape (1200×628)', ratio: 1200/628, hasImage: true, formats: ['Performance Max asset group'] },
    { label: 'Performance Max Square (1200×1200)', ratio: 1, hasImage: true, formats: ['Performance Max asset group'] },
    { label: 'Performance Max Portrait (960×1200)', ratio: 960/1200, hasImage: true, formats: ['Performance Max asset group'] },
    { label: 'Demand Gen Landscape (1200×628)', ratio: 1200/628, hasImage: true, formats: ['Demand Gen image ad'] },
    { label: 'Demand Gen Square (1200×1200)', ratio: 1, hasImage: true, formats: ['Demand Gen image ad'] },
    { label: 'YouTube :15 (16:9)', ratio: 16/9, hasImage: true, frames: 3, formats: ['YouTube video ad'] },
    { label: 'YouTube :30 (16:9)', ratio: 16/9, hasImage: true, frames: 3, formats: ['YouTube video ad'] },
    { label: 'Responsive Display Landscape (1200×628)', ratio: 1200/628, hasImage: true, formats: ['Responsive display ad'] },
    { label: 'Responsive Display Square (1200×1200)', ratio: 1, hasImage: true, formats: ['Responsive display ad'] }
  ],
  'Non-Brand Search': [
    { label: 'Responsive Search Ad (headlines + descriptions)', ratio: 3/1, hasImage: false, formats: ['Responsive search ad'] },
    { label: 'Expanded Text Ad', ratio: 3/1, hasImage: false, formats: ['Responsive search ad'] },
    { label: 'Call-Only Ad', ratio: 3/1, hasImage: false, formats: ['Call-only ad'] },
    { label: 'Performance Max Landscape (1200×628)', ratio: 1200/628, hasImage: true, formats: ['Performance Max asset group'] },
    { label: 'Performance Max Square (1200×1200)', ratio: 1, hasImage: true, formats: ['Performance Max asset group'] },
    { label: 'Performance Max Portrait (960×1200)', ratio: 960/1200, hasImage: true, formats: ['Performance Max asset group'] },
    { label: 'Demand Gen Landscape (1200×628)', ratio: 1200/628, hasImage: true, formats: ['Demand Gen image ad'] },
    { label: 'Demand Gen Square (1200×1200)', ratio: 1, hasImage: true, formats: ['Demand Gen image ad'] },
    { label: 'YouTube :15 (16:9)', ratio: 16/9, hasImage: true, frames: 3, formats: ['YouTube video ad'] },
    { label: 'YouTube :30 (16:9)', ratio: 16/9, hasImage: true, frames: 3, formats: ['YouTube video ad'] },
    { label: 'Responsive Display Landscape (1200×628)', ratio: 1200/628, hasImage: true, formats: ['Responsive display ad'] },
    { label: 'Responsive Display Square (1200×1200)', ratio: 1, hasImage: true, formats: ['Responsive display ad'] }
  ],
  // Round 132as, per direct feedback: "Display ads are animated we need copy
  // per frame up to 4." Standard programmatic display units today are
  // overwhelmingly served as animated HTML5 (not static), so all four sizes
  // now carry a filmstrip (see cmpDrawWireframeBox()'s frames>1 branch) —
  // previously only the one explicitly-named "Rich Media" unit was animated,
  // which understated how this Function actually ships. 4 frames each, the
  // stated max.
  'Programmatic Display': [
    // 2026-10-18 — every IAB standard display size plus the IAB high-impact units, grouped so the Size list reads in sections
    // (group → <optgroup>). Standard sizes belong to the "Standard banner" format; high-impact units to "High-impact display".
    { group: 'IAB standard', label: 'Medium Rectangle (300×250, animated)', ratio: 300/250, hasImage: true, frames: 4, formats: ['Standard banner'] },
    { group: 'IAB standard', label: 'Large Rectangle (336×280, animated)', ratio: 336/280, hasImage: true, frames: 4, formats: ['Standard banner'] },
    { group: 'IAB standard', label: 'Square (250×250, animated)', ratio: 1, hasImage: true, frames: 4, formats: ['Standard banner'] },
    { group: 'IAB standard', label: 'Leaderboard (728×90, animated)', ratio: 728/90, hasImage: true, frames: 4, formats: ['Standard banner'] },
    { group: 'IAB standard', label: 'Large Leaderboard (970×90, animated)', ratio: 970/90, hasImage: true, frames: 4, formats: ['Standard banner'] },
    { group: 'IAB standard', label: 'Banner (468×60, animated)', ratio: 468/60, hasImage: true, frames: 4, formats: ['Standard banner'] },
    { group: 'IAB standard', label: 'Skyscraper (160×600, animated)', ratio: 160/600, hasImage: true, frames: 4, formats: ['Standard banner'] },
    { group: 'IAB standard', label: 'Narrow Skyscraper (120×600, animated)', ratio: 120/600, hasImage: true, frames: 4, formats: ['Standard banner'] },
    { group: 'IAB standard', label: 'Mobile Banner (320×50, animated)', ratio: 320/50, hasImage: true, frames: 4, formats: ['Standard banner'] },
    { group: 'IAB standard', label: 'Large Mobile Banner (320×100, animated)', ratio: 320/100, hasImage: true, frames: 4, formats: ['Standard banner'] },
    { group: 'IAB standard', label: 'Mobile Small Banner (300×50, animated)', ratio: 300/50, hasImage: true, frames: 4, formats: ['Standard banner'] },
    { group: 'IAB high impact', label: 'Billboard (970×250, animated)', ratio: 970/250, hasImage: true, frames: 4, formats: ['High-impact display'] },
    { group: 'IAB high impact', label: 'Half Page / Filmstrip (300×600, animated)', ratio: 300/600, hasImage: true, frames: 4, formats: ['High-impact display'] },
    { group: 'IAB high impact', label: 'Portrait (300×1050, animated)', ratio: 300/1050, hasImage: true, frames: 4, formats: ['High-impact display'] },
    { group: 'IAB high impact', label: 'Pushdown (970×250 collapsed, expands to 970×415)', ratio: 970/250, hasImage: true, frames: 4, formats: ['High-impact display'] },
    { group: 'IAB high impact', label: 'Expandable Leaderboard (728×90, expands to 728×315)', ratio: 728/90, hasImage: true, frames: 4, formats: ['High-impact display'] },
    { group: 'IAB high impact', label: 'Expandable Rectangle (300×250, expands to 600×250)', ratio: 300/250, hasImage: true, frames: 4, formats: ['High-impact display'] },
    { group: 'IAB high impact', label: 'Mobile Interstitial (320×480)', ratio: 320/480, hasImage: true, frames: 4, formats: ['High-impact display'] },
    { group: 'IAB high impact', label: 'Tablet Interstitial (768×1024)', ratio: 768/1024, hasImage: true, frames: 4, formats: ['High-impact display'] },
    { group: 'IAB high impact', label: 'Sticky Footer (728×90 desktop / 320×50 mobile)', ratio: 728/90, hasImage: true, frames: 4, formats: ['High-impact display'] },
    { group: 'IAB high impact', label: 'Page Skin / Wallpaper (1920×1080 frame)', ratio: 1920/1080, hasImage: true, frames: 4, formats: ['High-impact display'] },
    { group: 'Rich media', label: 'Rich Media (animated, 300×250)', ratio: 300/250, hasImage: true, frames: 4, formats: ['Rich media'] },
    { group: 'Native', label: 'Native Card (1200×628)', ratio: 1200/628, hasImage: true, formats: ['Native ad'] },
    { group: 'Native', label: 'Native Square (1200×1200)', ratio: 1, hasImage: true, formats: ['Native ad'] },
    { group: 'Video, audio and other', label: 'Online Video :15 (16:9)', ratio: 16/9, hasImage: true, frames: 3, formats: ['Online video'] },
    { label: 'Online Video :30 (16:9)', ratio: 16/9, hasImage: true, frames: 3, formats: ['Online video'] },
    { label: 'Audio :30 (audio)', ratio: 3/1, hasImage: false, formats: ['Audio spot'] },
    { label: ':15 Spot (16:9)', ratio: 16/9, hasImage: true, frames: 3, formats: [':15 Spot'] },
    { label: ':30 Spot (16:9)', ratio: 16/9, hasImage: true, frames: 3, formats: [':30 Spot'] },
    { label: 'Email Template (600px wide)', ratio: 600/800, hasImage: true, stacked: true, formats: ['Standalone send'] },
    { label: 'Responsive Search Ad (headlines + descriptions)', ratio: 3/1, hasImage: false, formats: ['Responsive search ad'] }
  ],
  'Retail Media': [{ label: 'Medium Rectangle (300×250)', ratio: 300/250, hasImage: true }, { label: 'Sponsored Product Tile', ratio: 1, hasImage: true }],
  'Out-of-Home': [{ label: 'Bulletin (14×48)', ratio: 14/48, hasImage: true, stacked: true }, { label: 'Poster (6×12)', ratio: 6/12, hasImage: true, stacked: true }],
  'Radio': [{ label: ':15 Spot (audio)', ratio: 3/1, hasImage: false }, { label: ':30 Spot (audio)', ratio: 3/1, hasImage: false }],
  'PR': [{ label: 'Press Release (text)', ratio: 8.5/11, hasImage: false }],
  'Partner Media': [{ label: 'Medium Rectangle (300×250)', ratio: 300/250, hasImage: true }],
  'Field / ABM': [{ label: 'One-Pager (8.5×11)', ratio: 8.5/11, hasImage: true, stacked: true }],
  'Newspapers': [{ label: 'Full Page', ratio: 6/21, hasImage: true, stacked: true, print: true }, { label: 'Half Page', ratio: 6/10.5, hasImage: true, stacked: true, print: true }],
  'Podcasts': [{ label: 'Host-Read :30', ratio: 3/1, hasImage: false }, { label: 'Pre-Produced :30', ratio: 3/1, hasImage: false }],
  'Email — Remarketing': [{ label: 'Email Template (600px wide)', ratio: 600/800, hasImage: true, stacked: true }],
  'Internal Email': [{ label: 'Email Template (600px wide)', ratio: 600/900, hasImage: true, stacked: true }],
  'Remarketing': [
    { label: 'Medium Rectangle (300×250)', ratio: 300/250, hasImage: true, formats: ['Dynamic product/offer ad', 'Static retargeting ad'] },
    { label: 'Dynamic Product Ad (1080×1080)', ratio: 1, hasImage: true, formats: ['Dynamic product/offer ad'] },
    { label: 'Static Retargeting Landscape (1200×628)', ratio: 1200/628, hasImage: true, formats: ['Static retargeting ad'] }
  ]
};

const ILLUSTRATIVE_CHANNEL_CPM = {
  'Direct Mail — Prospects': 800, 'Direct Mail — Past Guests': 710, 'Direct Mail — Inquiries': 710,
  'Linear TV': 22, 'OTV': 26, 'CTV': 28,
  'Paid Social': 9, 'Brand Search': 4, 'Non-Brand Search': 6,
  'Internal Email': 1, 'Email — Remarketing': 200, 'PR': 15, 'Programmatic Display': 7, 'Partner Media': 12,
  'Retail Media': 9, 'Field / ABM': 650,
  'Magazines': 40, 'Newspapers': 34, 'Out-of-Home': 14, 'Radio': 18, 'Podcasts': 20,
  // Round 132xx — 'Remarketing' (pixel/audience-based paid retargeting),
  // priced like Paid Social/Programmatic Display's open-auction tier.
  'Remarketing': 10
};
const KINDS = { channelBP: CHANNEL_BEST_PRACTICES, objectiveBP: OBJECTIVE_BEST_PRACTICES, mediaMixBP: MEDIA_MIX_BEST_PRACTICES, measurementBP: MEASUREMENT_BEST_PRACTICES, copyBP: COPY_BEST_PRACTICE_BY_TREATMENT, adUnits: AD_UNIT_SPECS, cpmAll: { all: ILLUSTRATIVE_CHANNEL_CPM } };
module.exports = function reference(kind, key){
  const t = Object.prototype.hasOwnProperty.call(KINDS, kind) ? KINDS[kind] : null;
  if (!t || key == null) return null;
  const k = String(key);
  return Object.prototype.hasOwnProperty.call(t, k) ? t[k] : null;
};
