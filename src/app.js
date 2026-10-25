// HTTP routes. Built as a factory so tests can pass a fake PayPal client.
import express from "express";
import { seedWorkspace } from "./seed.js";
import { COOKIE, newWorkspaceId, readCookie, sign, verify } from "./workspaces.js";

export function createApp({ paypal, config, events, ledger, log = console }) {
  const app = express();

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
    const result = verified ? ledger.recordWebhook(event) : { recorded: false, reason: "not verified" };
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
      res.send(`Order ${order.id} ${order.status.toLowerCase()}. Ledger: ${result.recorded ? "payment recorded" : result.reason}.`);
    } catch (err) {
      res.status(502).send(err.message);
    }
  });

  app.get("/cancel", (_req, res) => res.send("Payment cancelled. Nothing was charged."));

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

  api.post("/reset", (req, res) => {
    ledger.reset(req.workspaceId);
    res.json({ seeded: seedWorkspace(ledger, req.workspaceId) });
  });

  app.use("/api", api);
  return app;
}
