// Creates a sandbox order and prints the link to approve it as the sandbox buyer.
// Usage: npm run order:create -- [amount, default 5.00]
import { loadConfig, requireCredentials } from "../src/config.js";
import { createPayPal } from "../src/paypal.js";

try {
  const config = loadConfig();
  requireCredentials(config);
  const value = process.argv[2] ?? "5.00";
  const order = await createPayPal(config).createOrder({
    value,
    returnUrl: `${config.publicUrl}/return`,
    cancelUrl: `${config.publicUrl}/cancel`,
  });
  const link = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve");
  console.log(`Order ${order.id} for £${value}. Approve it as the sandbox personal account:\n${link.href}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
