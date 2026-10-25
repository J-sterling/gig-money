// Append-only log of received webhook events (var/events.jsonl). Remembers
// event IDs so a retried delivery is recorded once.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export function createEventLog(path = "var/events.jsonl") {
  const entries = existsSync(path)
    ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const seen = new Set(entries.filter((e) => e.verified).map((e) => e.id));

  return {
    has: (id) => seen.has(id),
    add(entry) {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, JSON.stringify(entry) + "\n");
      entries.push(entry);
      if (entry.verified) seen.add(entry.id);
    },
    latest: (n = 50) => entries.slice(-n).reverse(),
  };
}
