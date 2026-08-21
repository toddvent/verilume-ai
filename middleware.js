// Site-wide password gate, running on Vercel's Edge Middleware — this
// executes in front of EVERY request (static frontend pages AND /api/*
// calls) before anything else, so it protects the whole site with one file,
// free on any Vercel plan (unlike the paid "Advanced Deployment Protection"
// add-on).
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
// system. Reverted the same day per direct follow-up ("We don't want to be
// public at all") back to an ALLOWLIST: everything is gated by default,
// with only one genuine technical exception staying open below.
//
// 2026-08-21, LATER the same day again — added a signed session COOKIE on
// top of the plain HTTP Basic Auth check below. Basic Auth alone looked
// like it satisfied "ask once per session, don't check again" from a
// simple page-to-page click-through test, but it broke the moment a real
// page (portal.html) started firing its own background fetch()/XHR calls
// to /api/* right after load: browsers do not reliably reuse cached Basic
// Auth credentials on script-initiated requests the same way they do on a
// normal full-page navigation. When one of those background calls hits
// this gate's 401 + WWW-Authenticate, the browser pops its native
// "Sign in" dialog again — mid-page, on top of content that already
// rendered — and re-entering the SAME correct password in that second
// popup can still read as "not working" if the visitor is actually being
// asked to re-auth a *different* background request than the one they
// think they're answering. This is exactly what happened on
// https://verilume.ai/portal.html?accountId=... on 2026-08-21: the page
// underneath the second popup had already rendered (its placeholder
// company name and "Loading today's standup..." were visible in the
// screenshot), proving the PAGE navigation's Basic Auth succeeded — it was
// a later same-page API call whose Basic Auth didn't carry through that
// triggered the second prompt.
//
// The fix: the first time a request presents CORRECT Basic Auth
// credentials, mint a signed, HttpOnly session cookie and hand it back via
// a same-URL redirect (GET/HEAD only — see below). Every request after
// that — including background fetch()/XHR calls, which browsers attach
// cookies to automatically and unconditionally, unlike the Basic Auth
// cache — is let through purely on the cookie, with no Basic Auth
// re-check and no native prompt. The visitor still only ever answers the
// native "Sign in" popup once; what changed is that a real session now
// backs that answer instead of relying on the browser's Basic Auth cache
// to keep applying itself to every kind of request a modern page makes.
//
// PUBLIC_PATHS is deliberately short — every entry here is something that
// MUST be reachable by a non-browser caller that can't complete an HTTP
// Basic Auth prompt (a bot/crawler making a plain GET), not a UX
// convenience:
//   - the Twilio domain-verification file: Twilio's own verification
//     crawler fetches this exact static file directly (no browser, no
//     credentials) to confirm domain ownership for SMS/Verify. Gating it
//     breaks that verification outright — this caused a real outage
//     earlier the same day (see RUNBOOK / project docs: "Twilio domain
//     verification failing (401)").
// Nothing else is exempted: every real page (marketing, login, portal,
// account, everything) and every /api/* route requires the shared site
// password (or the session cookie it mints). robots.txt is deliberately
// NOT exempted either — the site already ships a disallow-all robots.txt
// and noindex headers regardless, and per "not public at all" there's no
// reason a crawler should be able to fetch even that file unauthenticated.
const PUBLIC_PATHS = [
  /^\/twiliodomainverification183151a4\.txt$/,
];

// Session cookie the gate mints once Basic Auth succeeds. HttpOnly (no
// point exposing it to page JS — nothing on the page needs to read it,
// the browser just needs to keep sending it back) and Secure (this site is
// HTTPS-only). No Max-Age/Expires is set on the cookie itself, so browsers
// treat it as a true "session cookie" — cleared when the browser fully
// closes, matching "once per session" literally. The signed value also
// carries its own embedded expiry as a backstop (below), since some
// browsers' "continue where you left off" restore can resurrect session
// cookies across what a user would consider a new session.
const COOKIE_NAME = 'vl_site_auth';
const SESSION_MAX_HOURS = 24;

function bufferToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bufferToHex(sig);
}

async function mintSessionCookieValue(secret) {
  const expiry = Date.now() + SESSION_MAX_HOURS * 3600 * 1000;
  const sig = await hmacHex(secret, String(expiry));
  return `${expiry}.${sig}`;
}

// Not a cryptographically hardened constant-time compare (Edge Middleware
// has no dedicated primitive for that), but this token isn't the site's
// real security boundary — actual account auth is a separate system —
// this cookie only needs to be hard to forge without the shared secret,
// which the HMAC itself provides regardless of how the comparison runs.
function hexEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isValidSessionCookie(value, secret) {
  if (!value) return false;
  const dot = value.indexOf('.');
  if (dot < 0) return false;
  const expiryStr = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = await hmacHex(secret, expiryStr);
  return hexEqual(expected, sig);
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch (e) {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return '';
}

function challengeResponse() {
  // No credentials, or wrong credentials — prompt the browser's built-in
  // login dialog.
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

export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  if (PUBLIC_PATHS.some((re) => re.test(pathname))) {
    return;
  }

  // 2026-08-21, later same day again — CORS preflight requests (the
  // browser's automatic OPTIONS check before a cross-origin request that
  // carries a custom header, like X-Admin-Token) never carry the site's
  // Basic Auth credentials or session cookie; browsers deliberately send
  // preflight requests "bare." Gating OPTIONS the same as every other
  // method meant the preflight itself got a 401, which the browser then
  // reports to JS as an opaque "Failed to fetch" with no real status code
  // — this is what broke the /api/admin/fix-legacy-casing tool page.
  // OPTIONS carries no data of its own (server.js's own CORS handler is
  // what actually answers it, with Access-Control-Allow-Origin: '*' —
  // this site's own API already declares itself fetchable cross-origin),
  // so it's safe to let every OPTIONS request through unconditionally and
  // let the real request behind it go through the normal Basic
  // Auth/cookie check like anything else.
  if (request.method === 'OPTIONS') {
    return;
  }

  const expectedUser = process.env.SITE_BASIC_AUTH_USER;
  const expectedPass = process.env.SITE_BASIC_AUTH_PASS;

  // Not configured yet — don't block access.
  if (!expectedUser || !expectedPass) {
    return;
  }

  const secret = `${expectedUser}:${expectedPass}`;

  // 1) Already holding a valid session cookie — let it through with no
  // Basic Auth re-check at all. This is what makes background fetch()/XHR
  // calls (which always carry cookies, unlike the Basic Auth cache) work
  // reliably instead of intermittently re-prompting mid-page.
  const cookieValue = readCookie(request, COOKIE_NAME);
  if (await isValidSessionCookie(cookieValue, secret)) {
    return;
  }

  // 2) No valid cookie yet — fall back to checking Basic Auth credentials
  // on this request directly, same as before.
  const authHeader = request.headers.get('authorization');
  let suppliedUser = '';
  let suppliedPass = '';
  if (authHeader && authHeader.startsWith('Basic ')) {
    const encoded = authHeader.slice('Basic '.length);
    let decoded = '';
    try {
      decoded = atob(encoded);
    } catch (e) {
      decoded = '';
    }
    const sepIndex = decoded.indexOf(':');
    suppliedUser = sepIndex >= 0 ? decoded.slice(0, sepIndex) : '';
    suppliedPass = sepIndex >= 0 ? decoded.slice(sepIndex + 1) : '';
  }

  const credentialsCorrect = suppliedUser === expectedUser && suppliedPass === expectedPass;

  if (!credentialsCorrect) {
    return challengeResponse();
  }

  // Credentials correct, no cookie yet. For a plain page load (GET/HEAD),
  // mint the session cookie and hand it back via a same-URL redirect —
  // the browser's re-request of that same URL carries the new cookie, and
  // every request after that (this page's own later background API calls
  // included) rides on the cookie instead of the Basic Auth cache. For any
  // other method (POST/PUT/DELETE/etc.), skip the redirect — redirecting a
  // non-GET request risks the browser dropping its body — and just let
  // this one request through on Basic Auth like before; the cookie gets
  // minted on the next ordinary page load instead, which in practice
  // (a page navigation always precedes the page's own script-driven API
  // calls) has already happened by the time any such call fires.
  const method = (request.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return;
  }

  const cookieVal = await mintSessionCookieValue(secret);
  return new Response(null, {
    status: 302,
    headers: {
      Location: request.url,
      'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(cookieVal)}; Path=/; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    },
  });
}
