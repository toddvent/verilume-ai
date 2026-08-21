// Site-wide password gate, running on Vercel's Edge Middleware — this
// executes in front of EVERY request (static frontend pages AND /api/*
// calls) before anything else, so it protects the whole site with one file,
// free on any Vercel plan (unlike the paid "Advanced Deployment Protection"
// add-on).
//
// Uses standard HTTP Basic Auth: the browser shows its own native
// username/password popup. No custom login page needed.
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

// Paths that must stay reachable with no credentials, regardless of the
// Basic Auth gate below — third-party verification bots (e.g. Twilio's
// domain-verification crawler) hit these with no way to supply a
// username/password, so gating them causes verification to fail silently
// with a 401 that looks identical to a misconfigured gate.
//
// 2026-08-21 fix — /api/* is now exempt too. This gate was originally
// written to cover /api/* as well as the static pages (see the file
// header comment above), but that collided with the app's OWN real
// login system: every fetch() call from the frontend to /api/auth/* (and
// every other API route) was ALSO being challenged for the shared site
// password, and browsers don't reliably reuse cached Basic Auth
// credentials on background fetch()/XHR requests the way they do on a
// full page navigation — so a user could type a completely correct
// email/password into the app's login form and still get a 401, because
// the browser hadn't (yet, or reliably) attached Basic Auth to that
// specific background request. That's not a one-off login bug, it's a
// standing risk on every /api/* call the app makes.
//
// Real protection for API data is the app's own session/login system
// (POST /api/auth/login-user, its tokens, per-request auth checks) —
// that's what actually gates access to real accounts and data. The
// shared site password's job is narrower: keep the marketing/demo PAGES
// out of search engines and off random visitors while the site is
// unfinished. Gating the JSON API behind a second, browser-cache-
// dependent auth layer on top of that wasn't buying real security, just
// intermittent breakage. If the API surface itself needs to stay hidden
// from the public later, that should be a deliberate decision (e.g. an
// API-specific auth scheme), not a side effect of this page-level gate.
const PUBLIC_PATHS = [
  /^\/[a-f0-9]{32}\.html$/i, // Twilio domain-verification file (name = the verification token)
  /^\/robots\.txt$/,
  /^\/api\//, // app's own API — see comment above
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
  // login dialog.
  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Verilume (private)", charset="UTF-8"',
    },
  });
}
