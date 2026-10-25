// The worker's ledger: payments recorded from PayPal captures, plus the
// running tax set-aside estimate. Amounts are kept in pence.
import { isWorkspaceId } from "./workspaces.js";

export const TAX_NOTE = "Estimate, not tax advice.";
const pence = (value) => Math.round(Number(value) * 100);

export function createLedger(db, { setAsideRate = 0.25, now = () => new Date() } = {}) {
  const insertWs = db.prepare("INSERT OR IGNORE INTO workspaces (id, created_at) VALUES (?, ?)");
  const hasWs = db.prepare("SELECT 1 FROM workspaces WHERE id = ?");
  const insertPay = db.prepare(`INSERT OR IGNORE INTO payments
    (id, workspace_id, order_id, amount_pence, currency, payer, note, source, source_by, captured_at, recorded_via)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const list = db.prepare("SELECT * FROM payments WHERE workspace_id = ? ORDER BY captured_at DESC");
  const wipe = db.prepare("DELETE FROM payments WHERE workspace_id = ?");
  const oneById = db.prepare("SELECT * FROM payments WHERE id = ? AND workspace_id = ?");
  const tag = db.prepare("UPDATE payments SET source = ?, source_by = ?, source_reason = ? WHERE id = ? AND workspace_id = ? AND source IS NULL");
  const sources = db.prepare("SELECT DISTINCT source FROM payments WHERE workspace_id = ? AND source IS NOT NULL ORDER BY source");
  const examples = db.prepare(`SELECT source, payer, note FROM payments WHERE workspace_id = ? AND source IS NOT NULL
    AND note IS NOT NULL ORDER BY captured_at DESC`);

  function add(workspaceId, p) {
    if (!isWorkspaceId(workspaceId) || !hasWs.get(workspaceId)) return { recorded: false, reason: "unknown workspace" };
    const r = insertPay.run(p.id, workspaceId, p.order_id ?? null, p.amount_pence, p.currency, p.payer ?? null, p.note ?? null,
      p.source ?? null, p.source_by ?? null, p.captured_at, p.recorded_via);
    return { recorded: r.changes === 1, reason: r.changes === 1 ? null : "already recorded", workspaceId, id: p.id };
  }

  return {
    ensureWorkspace(id) {
      return insertWs.run(id, now().toISOString()).changes === 1; // true if new
    },

    // From our own authenticated capture call, so it can be trusted without a webhook.
    recordCapture(order) {
      const unit = order.purchase_units?.[0];
      const cap = unit?.payments?.captures?.[0];
      if (!cap || cap.status !== "COMPLETED") return { recorded: false, reason: "capture not completed" };
      const name = [order.payer?.name?.given_name, order.payer?.name?.surname].filter(Boolean).join(" ");
      return add(cap.custom_id ?? unit.custom_id, {
        id: cap.id, order_id: order.id, amount_pence: pence(cap.amount.value), currency: cap.amount.currency_code,
        payer: name || order.payer?.email_address || null, note: unit.description ?? null,
        captured_at: cap.create_time ?? now().toISOString(), recorded_via: "capture",
      });
    },

    // From a verified PAYMENT.CAPTURE.COMPLETED webhook; a no-op if the capture reply got there first.
    recordWebhook(event) {
      if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return { recorded: false, reason: "not a capture" };
      const cap = event.resource ?? {};
      return add(cap.custom_id, {
        id: cap.id, order_id: cap.supplementary_data?.related_ids?.order_id ?? null,
        amount_pence: pence(cap.amount?.value), currency: cap.amount?.currency_code,
        captured_at: cap.create_time ?? now().toISOString(), recorded_via: "webhook",
      });
    },

    addSeed: (workspaceId, p) => add(workspaceId, { ...p, recorded_via: "seed" }),

    // A paid PayPal invoice becomes income in the ledger.
    recordInvoicePayment: (workspaceId, { id, amount, payer, note, paid_at }) => add(workspaceId, {
      id, amount_pence: pence(amount.value), currency: amount.currency_code, payer, note,
      source: "Invoice", source_by: "invoice", captured_at: paid_at, recorded_via: "invoice",
    }),

    payments: (workspaceId) => list.all(workspaceId),

    // The last 30 days: earned, set aside and safe to spend, in pence.
    summary(workspaceId) {
      const since = new Date(now().getTime() - 30 * 864e5).toISOString();
      const rows = list.all(workspaceId).filter((p) => p.captured_at >= since && p.currency === "GBP");
      const earned = rows.reduce((a, p) => a + p.amount_pence, 0);
      const setAside = Math.round(earned * setAsideRate);
      return { period: "last 30 days", currency: "GBP", earned_pence: earned, set_aside_pence: setAside,
        safe_to_spend_pence: earned - setAside, set_aside_rate: setAsideRate, payments: rows.length, note: TAX_NOTE };
    },

    reset: (workspaceId) => wipe.run(workspaceId).changes,

    payment: (workspaceId, id) => oneById.get(id, workspaceId),
    // Tags an untagged payment; never overwrites an existing tag.
    setSource: (workspaceId, id, { source, by, reason }) => tag.run(source, by, reason ?? null, id, workspaceId).changes === 1,
    sources: (workspaceId) => sources.all(workspaceId).map((r) => r.source),
    // Up to n recent tagged payments per category, so the tagger can learn what each means.
    examples(workspaceId, n = 2) {
      const out = {};
      for (const r of examples.all(workspaceId)) (out[r.source] ??= []).length < n && out[r.source].push(`${r.payer}: ${r.note}`);
      return out;
    },
  };
}
