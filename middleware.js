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

// 2026-08-21 — flipped this file from an allowlist-of-public-paths model to
// a denylist-of-private-paths model, per direct instruction ("This site is
// live and needs to perform like a live site after the initial credentials
// are added. I can't trust what I see to move forward").
//
// Until now, only /api/*, the Twilio verification file, and robots.txt were
// exempt from the shared site password — every other static page, including
// the real customer-facing flow (login.html, forgot-password.html,
// onboarding.html, select-tier.html, portal.html, account.html,
// print-specs.html, ooh-specs.html, assessment.html, index.html, and every
// marketing/solution page), still required the shared Basic Auth site
// password on first load in a given browser. That's backwards for a live
// product: real customers don't have a separate "site password" to enter —
// only their own account email/password — so gating the app's own pages
// behind this on top of the real login system just interrupts genuine
// customer traffic with an unrelated credential prompt (as seen when
// clicking "Forgot Password" from login.html — a native browser Basic Auth
// popup, not the app's own styled login form).
//
// PRIVATE_PATHS is now a short DENYLIST of pages that still need to stay
// gated — genuinely internal/staff-only tooling, not the product itself.
// Today that's just ops-console.html (see RUNBOOK / project docs: it's a
// separate internal admin tool with its own independent login already,
// unrelated to the shared customer session convention). Everything else on
// the site — every real page and every /api/* route — is public. Add a
// path here only for something that is genuinely internal-only, never as a
// way to "soft-launch" a customer-facing page — that's what the app's own
// login/account system is for.
const PRIVATE_PATHS = [
  /^\/ops-console\.html$/,
];

export default function middleware(request) {
  const { pathname } = new URL(request.url);
  if (!PRIVATE_PATHS.some((re) => re.test(pathname))) {
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
  //
  // 2026-08-21 — added explicit no-store Cache-Control here as a defensive
  // hardening measure. This 401 challenge response previously had no
  // Cache-Control header at all, which means its cacheability was left to
  // Vercel/browser defaults rather than being explicitly forced off. A
  // cached 401 (at any layer — browser back-forward cache, an intermediate
  // proxy, Vercel's edge) served back on a later request — even one that
  // legitimately carries valid credentials — would look exactly like a
  // "keeps asking for site credentials again" bug. This response, and only
  // this response (the private-path gate), should never be cached by
  // anything, so it's marked accordingly.
  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Verilume (private)", charset="UTF-8"',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    },
  });
}
