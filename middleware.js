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

export default function middleware(request) {
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
