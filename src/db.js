// One SQLite file (Node's built-in node:sqlite), so judges have no database to install.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDb(path = "var/gig-money.db") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
    -- One row per PayPal capture. The capture ID is the key, so the capture
    -- reply and the webhook for the same payment record it once.
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      order_id TEXT,
      amount_pence INTEGER NOT NULL,
      currency TEXT NOT NULL,
      payer TEXT,
      note TEXT,
      source TEXT,
      source_by TEXT,
      captured_at TEXT NOT NULL,
      recorded_via TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payments_ws ON payments(workspace_id, captured_at);
  `);
  return db;
}
