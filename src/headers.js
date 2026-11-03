// Security headers on every response (found missing by the OWASP ZAP baseline
// scan). The page loads only its own /app.js and /style.css, with no inline
// script or style, so the policy can allow nothing else.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
  "connect-src 'self'", "form-action 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
].join("; ");

export function securityHeaders(_req, res, next) {
  res.set({
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  });
  next();
}

// Ledger, invoices and drafts are per-visitor; no browser or proxy keeps a copy.
export function noStore(_req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}
