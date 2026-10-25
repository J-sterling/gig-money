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
    -- Invoice drafts and what happened to them. status: draft, sending, sent, paid, rejected, failed.
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      request TEXT,
      draft TEXT NOT NULL,
      drafted_by TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT,
      decision_note TEXT,
      paypal_id TEXT UNIQUE,
      pay_url TEXT,
      sent_at TEXT,
      paid_at TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS invoices_ws ON invoices(workspace_id, created_at);
  `);
  // Columns added after the first release; existing databases get them here.
  addColumn(db, "payments", "source_reason", "TEXT");
  addColumn(db, "invoices", "reminder", "TEXT");          // JSON {subject, note, drafted_by}
  addColumn(db, "invoices", "reminder_status", "TEXT");   // draft, sent, rejected
  addColumn(db, "invoices", "reminded_at", "TEXT");
  return db;
}

function addColumn(db, table, column, type) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
