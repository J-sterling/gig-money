// Rollback for webhook:register: deletes the webhook in PAYPAL_WEBHOOK_ID and clears it in .env.
import { loadConfig, requireCredentials } from "../src/config.js";
import { setEnvVar } from "../src/envfile.js";
import { createPayPal } from "../src/paypal.js";
import { removeWebhook } from "../src/webhooks.js";

try {
  const config = loadConfig();
  requireCredentials(config);
  if (!config.webhookId) {
    console.log("PAYPAL_WEBHOOK_ID is empty; nothing to remove.");
    process.exit(0);
  }
  const removed = await removeWebhook(createPayPal(config), config.webhookId);
  setEnvVar("PAYPAL_WEBHOOK_ID", "");
  console.log(`${removed ? "Removed" : "PayPal had no webhook with"} ${config.webhookId}; cleared PAYPAL_WEBHOOK_ID in .env.`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
