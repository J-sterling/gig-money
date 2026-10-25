// Prints an AI-drafted invoice. Nothing is sent to PayPal or the client.
// Usage: npm run draft -- "invoice Northside Café £120 for Saturday's shoot, due in 14 days"
import "../src/config.js"; // loads .env
import { draftInvoice } from "../src/draft-invoice.js";
import { createDailyCap, createModel, modelConfig } from "../src/model.js";

try {
  const mc = modelConfig();
  const started = Date.now();
  const { draft, modelId } = await draftInvoice(process.argv.slice(2).join(" "), { model: createModel(mc), cap: createDailyCap(mc.dailyLimit), timeoutMs: mc.timeoutMs });
  console.log(`Draft (not sent) from ${modelId ?? mc.modelId} in ${((Date.now() - started) / 1000).toFixed(1)} s:`);
  console.log(JSON.stringify(draft, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
