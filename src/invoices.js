// Invoice drafts and the approval gate (N4). Drafting never touches PayPal;
// approve() is the only path that creates and sends a PayPal invoice, and a
// draft can be approved or rejected once (a failed send can be retried).
import { randomBytes } from "node:crypto";
import { InvoiceFields } from "./draft-invoice.js";
import { ReminderDraft } from "./draft-reminder.js";

export class GateError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const EDITABLE = ["client_name", "client_email", "amount", "currency", "description", "due_date"];

export function createInvoiceBook(db, { paypal, ledger, now = () => new Date() }) {
  const insert = db.prepare(`INSERT INTO invoices (id, workspace_id, status, request, draft, drafted_by, reason, created_at)
    VALUES (?, ?, 'draft', ?, ?, ?, ?, ?)`);
  const one = db.prepare("SELECT * FROM invoices WHERE id = ? AND workspace_id = ?");
  const byPayPalId = db.prepare("SELECT * FROM invoices WHERE paypal_id = ?");
  const all = db.prepare("SELECT * FROM invoices WHERE workspace_id = ? ORDER BY created_at DESC");
  // The gate: only a draft (or a failed send) in this workspace can move on, and only once.
  const claim = db.prepare(`UPDATE invoices SET status = 'sending', decided_at = ?, draft = ?, error = NULL
    WHERE id = ? AND workspace_id = ? AND status IN ('draft', 'failed')`);
  const reject = db.prepare(`UPDATE invoices SET status = 'rejected', decided_at = ?, decision_note = ?
    WHERE id = ? AND workspace_id = ? AND status = 'draft'`);
  const sent = db.prepare("UPDATE invoices SET status = 'sent', paypal_id = ?, pay_url = ?, sent_at = ? WHERE id = ?");
  const failed = db.prepare("UPDATE invoices SET status = 'failed', error = ? WHERE id = ?");
  const paid = db.prepare("UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'sent'");
  const wipe = db.prepare("DELETE FROM invoices WHERE workspace_id = ?");
  // Reminders get the same gate: drafted, then approved or rejected once.
  const setReminder = db.prepare(`UPDATE invoices SET reminder = ?, reminder_status = 'draft'
    WHERE id = ? AND workspace_id = ? AND status = 'sent' AND (reminder_status IS NULL OR reminder_status != 'draft')`);
  const claimReminder = db.prepare(`UPDATE invoices SET reminder_status = 'sending', reminder = ?
    WHERE id = ? AND workspace_id = ? AND status = 'sent' AND reminder_status = 'draft'`);
  const reminderDone = db.prepare("UPDATE invoices SET reminder_status = ?, reminded_at = ? WHERE id = ?");
  const reminderBack = db.prepare("UPDATE invoices SET reminder_status = 'draft' WHERE id = ?");

  const view = (row) => row && { ...row, draft: JSON.parse(row.draft), reminder: row.reminder ? JSON.parse(row.reminder) : null };
  const mustGet = (ws, id) => {
    const row = one.get(id, ws);
    if (!row) throw new GateError(404, "No such draft in this demo.");
    return row;
  };

  function markPaid(row, invoice) {
    if (paid.run(now().toISOString(), row.id).changes !== 1) return false;
    const draft = JSON.parse(row.draft);
    const tx = invoice?.payments?.transactions?.[0];
    const amount = invoice?.payments?.paid_amount ?? { value: String(draft.amount), currency_code: draft.currency };
    ledger.recordInvoicePayment(row.workspace_id, {
      id: `INV-${tx?.payment_id ?? row.paypal_id}`, amount, payer: draft.client_name,
      note: `Invoice: ${draft.description}`, paid_at: tx?.payment_date ?? now().toISOString(),
    });
    return true;
  }

  return {
    create(ws, { request, draft, draftedBy, reason }) {
      const id = "drf_" + randomBytes(6).toString("hex");
      insert.run(id, ws, request ?? null, JSON.stringify(InvoiceFields.parse(draft)), draftedBy, reason ?? null, now().toISOString());
      return view(one.get(id, ws));
    },

    list: (ws) => all.all(ws).map(view),

    async approve(ws, id, edits = {}) {
      const row = mustGet(ws, id);
      const merged = { ...JSON.parse(row.draft) };
      for (const k of EDITABLE) if (k in edits) merged[k] = edits[k];
      const check = InvoiceFields.safeParse(merged);
      if (!check.success) throw new GateError(400, "The edited draft isn't valid: " + check.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "));
      if (check.data.due_date < now().toISOString().slice(0, 10)) throw new GateError(400, "The due date is in the past.");
      if (claim.run(now().toISOString(), JSON.stringify(check.data), id, ws).changes !== 1) {
        throw new GateError(409, `This draft is already ${row.status}; it can't be approved again.`);
      }
      const d = check.data;
      try {
        const inv = await paypal.createInvoice({
          reference: ws, clientName: d.client_name, clientEmail: d.client_email, amount: d.amount, currency: d.currency,
          description: d.description, dueDate: d.due_date, note: "Gig Money demo invoice (PayPal sandbox).",
        });
        const sendReply = await paypal.sendInvoice(inv.id);
        const payUrl = sendReply?.href ?? sendReply?.links?.find((l) => l.rel === "payer-view")?.href ?? inv.detail?.metadata?.recipient_view_url ?? null;
        sent.run(inv.id, payUrl, now().toISOString(), id);
      } catch (err) {
        failed.run(err.message, id);
        throw new GateError(502, `PayPal didn't take the invoice: ${err.message}`);
      }
      return view(one.get(id, ws));
    },

    reject(ws, id, note) {
      const row = mustGet(ws, id);
      if (reject.run(now().toISOString(), String(note ?? "").slice(0, 300) || null, id, ws).changes !== 1) {
        throw new GateError(409, `This draft is already ${row.status}.`);
      }
      return view(one.get(id, ws));
    },

    // From a verified INVOICING.INVOICE.PAID webhook.
    recordPaidWebhook(event) {
      const invoice = event.resource?.invoice ?? event.resource;
      const row = invoice?.id && byPayPalId.get(invoice.id);
      if (!row || row.workspace_id !== invoice.detail?.reference) return { recorded: false, reason: "unknown invoice" };
      return { recorded: markPaid(row, invoice), reason: null };
    },

    // Asks PayPal directly; this is how it works locally without webhooks.
    async refresh(ws, id) {
      const row = mustGet(ws, id);
      if (row.status === "sent") {
        const inv = await paypal.getInvoice(row.paypal_id);
        if (inv.status === "PAID" || inv.status === "MARKED_AS_PAID") markPaid(row, inv);
      }
      return view(one.get(id, ws));
    },

    // Store a reminder draft for a sent invoice (from the model or the saved wording).
    addReminder(ws, id, { subject, note, draftedBy }) {
      const row = mustGet(ws, id);
      const r = ReminderDraft.parse({ subject, note });
      if (setReminder.run(JSON.stringify({ ...r, drafted_by: draftedBy }), id, ws).changes !== 1) {
        throw new GateError(409, row.status !== "sent" ? `Only a sent, unpaid invoice can get a reminder; this one is ${row.status}.` : "A reminder draft is already waiting.");
      }
      return view(one.get(id, ws));
    },

    async approveReminder(ws, id, edits = {}) {
      const row = mustGet(ws, id);
      const current = row.reminder ? JSON.parse(row.reminder) : null;
      const check = ReminderDraft.safeParse({ subject: edits.subject ?? current?.subject, note: edits.note ?? current?.note });
      if (!check.success) throw new GateError(400, "The reminder needs a subject and a note (up to 600 characters).");
      if (claimReminder.run(JSON.stringify({ ...check.data, drafted_by: current?.drafted_by }), id, ws).changes !== 1) {
        throw new GateError(409, "There's no reminder draft waiting for this invoice.");
      }
      // PayPal can only log a reminder when the invoice has a client email
      // (CANNOT_REMIND_AS_BILLING_INFO_ABSENT otherwise); without one, the
      // approved text and pay link are for the worker to send themselves.
      const via = JSON.parse(row.draft).client_email ? "paypal" : "copy";
      if (via === "paypal") {
        try {
          await paypal.remindInvoice(row.paypal_id, check.data);
        } catch (err) {
          reminderBack.run(id);
          throw new GateError(502, `PayPal didn't log the reminder: ${err.message}`);
        }
      }
      db.prepare("UPDATE invoices SET reminder = ? WHERE id = ?").run(JSON.stringify({ ...check.data, drafted_by: current?.drafted_by, via }), id);
      reminderDone.run("sent", now().toISOString(), id);
      return view(one.get(id, ws));
    },

    rejectReminder(ws, id) {
      const row = mustGet(ws, id);
      if (row.reminder_status !== "draft") throw new GateError(409, "There's no reminder draft waiting for this invoice.");
      reminderDone.run("rejected", null, id);
      return view(one.get(id, ws));
    },

    get: (ws, id) => view(mustGet(ws, id)),

    reset: (ws) => wipe.run(ws).changes,
  };
}
