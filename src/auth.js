// Shared demo password (Basic auth, any username) for a public deploy.
// /health and the PayPal webhook stay open: PayPal can't send a password,
// and the webhook route trusts only events whose signature PayPal confirms.
import { timingSafeEqual } from "node:crypto";

const OPEN = new Set(["/health", "/webhooks/paypal"]);

export function passwordGate(password) {
  const want = Buffer.from(password);
  return (req, res, next) => {
    if (!password || OPEN.has(req.path)) return next();
    const [scheme, encoded] = String(req.headers.authorization ?? "").split(" ");
    const given = scheme === "Basic" && encoded ? Buffer.from(Buffer.from(encoded, "base64").toString("utf8").split(":").slice(1).join(":")) : Buffer.alloc(0);
    if (given.length === want.length && timingSafeEqual(given, want)) return next();
    res.set("WWW-Authenticate", 'Basic realm="Gig Money demo (any username; password in the testing instructions)", charset="UTF-8"');
    res.status(401).send("This demo needs the password from the testing instructions (any username).");
  };
}
