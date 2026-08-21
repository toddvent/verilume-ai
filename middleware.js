// Site-wide password gate, running on Vercel's Edge Middleware — this
// executes in front of EVERY request (static frontend pages AND /api/*
// calls) before anything else, so it protects the whole site with one file,
// free on any Vercel plan (unlike the paid "Advanced Deployment Protection"
// add-on).
//
// Uses standard HTTP Basic Auth: the browser shows its own native
// username/password popup. No custom login page needed. Once entered, the
// browser caches those credentials for this origin and resends them
// automatically on every later request in that browser session (including
// the app's own same-origin fetch() calls to /api/*) — so in practice a
// visitor is prompted once per browser session, not on every page, even
// though the server is still technically checking every single request.
//
// Configure the credentials via two Vercel Environment Variables (see
// project Settings -> Environment Variables):
//   SITE_BASIC_AUTH_USER
//   SITE_BASIC_AUTH_PASS
//
// If either variable is unset, the gate is skipped entirely (fails open)
// rather than accidentally locking everyone out of a misconfigured deploy.

export const config = {
  // Matches every path, including the homepage, every /frontend/*.html
  // page, robots.txt, and every /api/* route.
  matcher: '/:path*',
};

// 2026-08-21 (reverted same day) — this file briefly flipped from an
// allowlist-of-public-paths model to a denylist-of-private-paths model
// (only ops-console.html gated, everything else public), per an earlier
// direct instruction that the live product's own pages/APIs shouldn't sit
// behind an unrelated shared password on top of the app's real login
// system. That reasoning still holds for a genuinely public product — but
// per direct follow-up the same day ("We ended up removing site
// credentials from the entire site not the specific pages or API calls
// alone... We don't want to be public at all"), this site is still in a
// pre-launch/testing phase, not meant to be reachable by the general public
// at all yet. Reverted back to an ALLOWLIST model: everything is gated by
// default, with only the one genuine technical exception below staying
// open. When this product is actually ready to be public, the fix is to
// widen PUBLIC_PATHS deliberately (or remove the gate), not to reintroduce
// this same back-and-forth.
//
// PUBLIC_PATHS is deliberately short — every entry here is something that
// MUST be reachable by a non-browser caller that can't complete an HTTP
// Basic Auth prompt (a bot/crawler making a plain GET), not a UX
// convenience:
//   - the Twilio domain-verification file: Twilio's own verification
//     crawler fetches this exact static file directly (no browser, no
//     credentials) to confirm domain ownership for SMS/Verify. Gating it
//     breaks that verification outright — this caused a real outage
//     earlier this same day (see RUNBOOK / project docs: "Twilio domain
//     verification failing (401)").
// Nothing else is exempted: every real page (marketing, login, portal,
// account, everything) and every /api/* route requires the shared site
// password. robots.txt is intentionally NOT exempted either — the site
// already ships a disallow-all robots.txt and noindex headers regardless,
// and per "we don't want to be public at all," there's no reason a crawler
// should be able to fetch even that file unauthenticated.
const PUBLIC_PATHS = [
  /^\/twiliodomainverification183151a4\.txt$/,
];

export default function middleware(request) {
  const { pathname } = new URL(request.url);
  if (PUBLIC_PATHS.some((re) => re.test(pathname))) {
    return;
  }

  const expectedUser = process.env.SITE_BASIC_AUTH_USER;
  const expectedPass = process.env.SITE_BASIC_AUTH_PASS;

  // Not configured yet — don't block access.
  if (!expectedUser || !expectedPass) {
    return;
  }

  const authHeader = request.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Basic ')) {
    const encoded = authHeader.slice('Basic '.length);
    let decoded = '';
    try {
      decoded = atob(encoded);
    } catch (e) {
      decoded = '';
    }
    const sepIndex = decoded.indexOf(':');
    const suppliedUser = sepIndex >= 0 ? decoded.slice(0, sepIndex) : '';
    const suppliedPass = sepIndex >= 0 ? decoded.slice(sepIndex + 1) : '';

    if (suppliedUser === expectedUser && suppliedPass === expectedPass) {
      return; // credentials correct — let the request through
    }
  }

  // No credentials, or wrong credentials — prompt the browser's built-in
  // login dialog. The browser caches a correct answer for this origin for
  // the rest of that browser session, so this prompt is effectively a
  // "once per session" gate from the visitor's point of view, even though
  // the check itself runs on every request.
  //
  // Explicit no-store Cache-Control on this 401 challenge response — a
  // cached 401 served back on a later request, even one that legitimately
  // carries valid credentials, would look exactly like a "keeps asking for
  // site credentials again" bug.
  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Verilume (private)", charset="UTF-8"',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    },
  });
}

