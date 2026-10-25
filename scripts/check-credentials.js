// Step 2: prove the sandbox credentials work. Prints no secrets.
import { loadConfig, requireCredentials } from "../src/config.js";
import { createPayPal } from "../src/paypal.js";

try {
  const config = loadConfig();
  requireCredentials(config);
  const paypal = createPayPal(config);
  const { expiresAt } = await paypal.getToken();
  const { webhooks = [] } = await paypal.listWebhooks();
  console.log(`OK: sandbox token valid until ${new Date(expiresAt).toISOString()}; ${webhooks.length} webhook(s) registered.`);
} catch (err) {
  console.error(`Credential check failed: ${err.message}`);
  if (err.status === 401) console.error("Check the client ID and secret, and that they come from the Sandbox tab, not Live.");
  process.exit(1);
}
