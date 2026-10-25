// Small in-memory rate limits per IP, so a public demo can't be flooded or
// burn the free model's daily calls in a burst.
export function rateLimit({ perMinute, message = "Too many requests. Wait a minute and try again.", now = Date.now }) {
  const hits = new Map();
  return (req, res, next) => {
    const t = now();
    const key = req.ip ?? "unknown";
    const recent = (hits.get(key) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= perMinute) {
      res.set("Retry-After", "60");
      return res.status(429).json({ error: message });
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear(); // keep memory bounded
    next();
  };
}
