// Site password removed (2026-11-16).
// The HTTP Basic Auth gate that used SITE_BASIC_AUTH_USER / SITE_BASIC_AUTH_PASS is gone, so every request passes straight through.
// Search engines are still told not to index or follow: vercel.json sends "X-Robots-Tag: noindex, nofollow, noarchive" on every route,
// and robots.txt at the repo root still disallows all crawlers. Do not remove either until launch.
// Returning nothing from an Edge Middleware function lets the request continue unchanged.
export default function middleware() {}
