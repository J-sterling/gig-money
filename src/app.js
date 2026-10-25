// HTTP routes. Built as a factory so tests can pass a fake PayPal client.
import { fileURLToPath } from "node:url";
import express from "express";
import { GateError } from "./invoices.js";
import { savedDraft, whyNoModel } from "./saved-draft.js";
import { seedWorkspace } from "./seed.js";
import { COOKIE, newWorkspaceId, readCookie, sign, verify } from "./workspaces.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

// drafter(request) -> { draft, modelId }; throws when the model is unavailable.
export function createApp({ paypal, config, events, ledger, invoices, drafter, log = console }) {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => res.json({ ok: true, env: "sandbox" }));

  // PayPal needs the exact bytes it sent to verify the signature, so this
  // route reads the raw body.
  app.post("/webhooks/paypal", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    const rawBody = req.body.toString("utf8");
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: "Body is not JSON." });
    }
    if (events.has(event.id)) return res.json({ received: true, duplicate: true });

    let verified = false;
    if (config.webhookId) {
      try {
        verified = await paypal.verifyWebhook({ headers: req.headers, rawBody, webhookId: config.webhookId });
      } catch (err) {
        log.error(`Webhook ${event.id}: ${err.message}`);
      }
    } else {
      log.warn("PAYPAL_WEBHOOK_ID is not set, so webhook signatures can't be checked. Run npm run webhook:register.");
    }
    events.add({
      id: event.id,
      event_type: event.event_type,
      resource_id: event.resource?.id ?? null,
      verified,
      received_at: new Date().toISOString(),
    });
    // Only verified events may change the ledger (N3).
    let result = { recorded: false, reason: "not verified" };
    if (verified) result = event.event_type === "INVOICING.INVOICE.PAID" ? invoices.recordPaidWebhook(event) : ledger.recordWebhook(event);
    log.info(`Webhook ${event.event_type} ${event.id} ${verified ? "verified" : "NOT verified (logged only)"}; ledger: ${result.recorded ? "recorded" : result.reason}`);
    // 200 either way so PayPal stops retrying.
    res.json({ received: true, verified });
  });

  app.get("/events", (_req, res) => res.json(events.latest()));

  // Buyer approved the order in PayPal and was sent back here. The capture
  // reply comes from our own authenticated call, so it goes straight into
  // the ledger; no webhook (or public URL) is needed for that.
  app.get("/return", async (req, res) => {
    const id = String(req.query.token ?? "");
    if (!id) return res.status(400).send("Missing order id (token).");
    try {
      const order = await paypal.captureOrder(id);
      const result = ledger.recordCapture(order);
      log.info(`Order ${order.id} ${order.status}; ledger: ${result.recorded ? "payment recorded" : result.reason}`);
      res.redirect(303, `/?paid=${result.recorded ? "1" : "0"}`);
    } catch (err) {
      res.status(502).send(err.message);
    }
  });

  app.get("/cancel", (_req, res) => res.redirect(303, "/?cancelled=1"));

  // ---- Demo workspace API ----
  const api = express.Router();
  api.use(express.json({ limit: "10kb" }));
  api.use((req, res, next) => {
    let id = verify(readCookie(req.headers.cookie), config.sessionSecret);
    if (!id) {
      id = newWorkspaceId();
      res.cookie(COOKIE, sign(id, config.sessionSecret), {
        httpOnly: true, sameSite: "lax", secure: config.publicUrl.startsWith("https://"), maxAge: 30 * 864e5,
      });
    }
    if (ledger.ensureWorkspace(id)) seedWorkspace(ledger, id);
    req.workspaceId = id;
    next();
  });

  api.get("/ledger", (req, res) => {
    res.json({ payments: ledger.payments(req.workspaceId), summary: ledger.summary(req.workspaceId) });
  });

  // "Get paid": a sandbox order the visitor approves as the sandbox buyer.
  api.post("/get-paid", async (req, res) => {
    const value = Number(req.body?.amount ?? 25);
    if (!(value >= 1 && value <= 500)) return res.status(400).json({ error: "Amount must be between £1 and £500." });
    try {
      const order = await paypal.createOrder({
        value: value.toFixed(2), customId: req.workspaceId, description: "Gig Money demo payment",
        returnUrl: `${config.publicUrl}/return`, cancelUrl: `${config.publicUrl}/cancel`,
      });
      const link = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve");
      res.json({ order_id: order.id, approve_url: link.href });
    } catch (err) {
      log.error(err.message);
      res.status(502).json({ error: "PayPal didn't create the order. Try again in a moment." });
    }
  });

  // ---- Invoices: draft, then approve or reject (the gate is in invoices.js) ----
  api.get("/invoices", (req, res) => res.json(invoices.list(req.workspaceId)));

  api.post("/drafts", async (req, res) => {
    const request = String(req.body?.request ?? "").trim();
    if (!request) return res.status(400).json({ error: "Describe the invoice, e.g. \"invoice Northside Café £120 for Saturday's shoot, due in 14 days\"." });
    if (request.length > 500) return res.status(400).json({ error: "Keep the request under 500 characters." });
    let made;
    try {
      const { draft, modelId } = await drafter(request);
      const { reason, ...fields } = draft;
      made = { draft: fields, reason, draftedBy: modelId ?? "model" };
    } catch (err) {
      log.warn(`Draft fell back to the saved example: ${err.message}`);
      const { draft, draftedBy } = savedDraft(whyNoModel(err));
      const { reason, ...fields } = draft;
      made = { draft: fields, reason, draftedBy };
    }
    res.status(201).json(invoices.create(req.workspaceId, { request, ...made }));
  });

  const gate = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      if (err instanceof GateError) return res.status(err.status).json({ error: err.message });
      log.error(err.message);
      res.status(500).json({ error: "Something went wrong. Try again." });
    }
  };
  api.post("/drafts/:id/approve", gate((req) => invoices.approve(req.workspaceId, req.params.id, req.body?.edits ?? {})));
  api.post("/drafts/:id/reject", gate((req) => invoices.reject(req.workspaceId, req.params.id, req.body?.note)));
  api.post("/invoices/:id/refresh", gate((req) => invoices.refresh(req.workspaceId, req.params.id)));

  api.post("/reset", (req, res) => {
    ledger.reset(req.workspaceId);
    invoices.reset(req.workspaceId);
    res.json({ seeded: seedWorkspace(ledger, req.workspaceId) });
  });

  app.use("/api", api);
  app.use(express.static(PUBLIC_DIR));
  return app;
}
