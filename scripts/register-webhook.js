// Step 3: register <public-url>/webhooks/paypal with PayPal and save its ID to .env.
// Usage: npm run webhook:register -- https://your-public-url
import { loadConfig, requireCredentials } from "../src/config.js";
import { setEnvVar } from "../src/envfile.js";
import { createPayPal } from "../src/paypal.js";

const EVENT_TYPES = ["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "INVOICING.INVOICE.PAID"];

const base = process.argv[2];
if (!base?.startsWith("https://")) {
  console.error("Give the app's public HTTPS URL, e.g. npm run webhook:register -- https://example.ts.net");
  process.exit(1);
}
try {
  const config = loadConfig();
  requireCredentials(config);
  const hook = await createPayPal(config).createWebhook(`${base.replace(/\/$/, "")}/webhooks/paypal`, EVENT_TYPES);
  setEnvVar("PAYPAL_WEBHOOK_ID", hook.id);
  console.log(`Registered ${hook.url} for ${EVENT_TYPES.length} event types. Saved PAYPAL_WEBHOOK_ID to .env; restart the server.`);
} catch (err) {
  console.error(err.message);
  if (err.body?.name === "WEBHOOK_URL_ALREADY_EXISTS") console.error("That URL is already registered; its ID is in the dashboard under the app's webhooks.");
  process.exit(1);
}
