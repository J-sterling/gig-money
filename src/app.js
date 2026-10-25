// HTTP routes. Built as a factory so tests can pass a fake PayPal client.
import express from "express";

export function createApp({ paypal, config, events, log = console }) {
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
    log.info(`Webhook ${event.event_type} ${event.id} ${verified ? "verified" : "NOT verified (logged only)"}`);
    // 200 either way so PayPal stops retrying; unverified events never reach the ledger.
    res.json({ received: true, verified });
  });

  app.get("/events", (_req, res) => res.json(events.latest()));

  // Buyer approved the order in PayPal and was sent back here.
  app.get("/return", async (req, res) => {
    const id = String(req.query.token ?? "");
    if (!id) return res.status(400).send("Missing order id (token).");
    try {
      const order = await paypal.captureOrder(id);
      res.send(`Order ${order.id} ${order.status.toLowerCase()}. The webhook should arrive shortly; check /events.`);
    } catch (err) {
      res.status(502).send(err.message);
    }
  });

  app.get("/cancel", (_req, res) => res.send("Payment cancelled. Nothing was charged."));

  return app;
}
