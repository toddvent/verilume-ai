/* Which channels can reach each audience Segment. Served per segment by POST /api/app/recommend (fn 'segmentChannels'); the portal no longer holds this table.
   Maintained by hand. Illustrative starting mapping, not a claim of researched channel-by-audience performance. */
const TABLE = {
  'Past Customers': ['Internal Email', 'Remarketing', 'Email — Remarketing', 'Direct Mail — Past Guests', 'Paid Social', 'Retail Media'],
  'Hand-Raisers': ['Internal Email', 'Remarketing', 'Email — Remarketing', 'Direct Mail — Inquiries', 'Paid Social', 'Programmatic Display', 'Non-Brand Search', 'Brand Search'],
  // 2026-09-20 — replaces 'New To Brand' (see ACCOUNT_SEGMENTS' own comment
  // on the mapping). A Prospect has already shown some interest (raised a
  // hand short of Hand-Raiser status, or matches a rented/licensed list this
  // account already screens for fit) but hasn't converted — broad-reach
  // acquisition channels still apply, but the paid-search split leans a
  // little more Brand than a cold Future Customer, since some Prospects
  // already know the brand's name even if they haven't bought yet.
  'Prospects': ['Linear TV', 'OTV', 'CTV', 'Paid Social', 'Non-Brand Search', 'Brand Search', 'Programmatic Display', 'Direct Mail — Prospects', 'Out-of-Home', 'Radio', 'Magazines', 'Newspapers', 'Podcasts', 'Retail Media'],
  // 2026-09-20 — new. Broader, top-of-funnel/aspirational people not yet
  // in-market at all (no signal of interest on file, unlike Prospects) —
  // pure mass-reach/brand-building channels, Non-Brand Search only (no
  // Brand Search — there's no brand awareness yet to capture), no Direct
  // Mail (no list to mail).
  'Future Customers': ['Linear TV', 'OTV', 'CTV', 'Paid Social', 'Non-Brand Search', 'Programmatic Display', 'Out-of-Home', 'Radio', 'Magazines', 'Newspapers', 'Podcasts'],
  // 2026-09-20 — new. Known site visitors with no identity on file: a
  // retargeting/remarketing audience, not an acquisition one, per Todd's own
  // framing of this segment. Leans on pixel-based, addressable-to-the-
  // anonymous-visitor channels rather than broad/rented-list ones.
  'Anonymous Website Traffic': ['Programmatic Display', 'Paid Social', 'Email — Remarketing', 'Remarketing'],
  // 2026-09-28 — new. A win-back list (former customers who cancelled an
  // order), so it leans on the same owned/addressable retention channels as
  // Past Customers rather than broad acquisition ones.
  'Cancelled Orders': ['Internal Email', 'Email — Remarketing', 'Direct Mail — Past Guests', 'Paid Social'],
  // Retired from ACCOUNT_SEGMENTS (no longer selectable) but kept as a
  // legacy fallback for any already-saved campaign/account record whose
  // segment still references it — see ACCOUNT_SEGMENTS' own comment.
  'Partners': ['Partner Media', 'Field / ABM', 'PR', 'Internal Email'],
  'Sales Team': ['Internal Email', 'Field / ABM', 'PR']
};
module.exports = function segmentChannels(segs){
  const out = {};
  (Array.isArray(segs) ? segs : []).slice(0, 30).forEach(s => { const k = String(s); out[k] = Object.prototype.hasOwnProperty.call(TABLE, k) ? TABLE[k].slice() : []; });
  return out;
};
