// Step 3: register <public-url>/webhooks/paypal with PayPal and save its ID to .env.
// Safe to re-run: an already-registered URL is reused. Undo with npm run webhook:remove.
// Usage: npm run webhook:register -- https://your-public-url
import { loadConfig, requireCredentials } from "../src/config.js";
import { setEnvVar } from "../src/envfile.js";
import { createPayPal } from "../src/paypal.js";
import { EVENT_TYPES, registerWebhook } from "../src/webhooks.js";

const base = process.argv[2];
if (!base?.startsWith("https://")) {
  console.error("Give the app's public HTTPS URL, e.g. npm run webhook:register -- https://example.ts.net");
  process.exit(1);
}
try {
  const config = loadConfig();
  requireCredentials(config);
  const hook = await registerWebhook(createPayPal(config), base);
  setEnvVar("PAYPAL_WEBHOOK_ID", hook.id);
  console.log(`${hook.reused ? "Reused the existing webhook for" : "Registered"} ${hook.url} (${EVENT_TYPES.length} event types). Saved PAYPAL_WEBHOOK_ID to .env; restart the server.`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
