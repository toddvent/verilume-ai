// Vercel catch-all serverless function: every request under /api/* lands
// here (the [...path] filename is Vercel's convention for "match any
// sub-path"), and Node.js's request/response objects it hands us are the
// same shape as Node's native http module — so the existing handler in
// backend/server.js, which already does its own internal routing by
// parsing req.url, works completely unmodified.
module.exports = require('../backend/server.js');
