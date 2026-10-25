// Prints an AI-drafted invoice. Nothing is sent to PayPal or the client.
// Usage: npm run draft -- "invoice Northside Café £120 for Saturday's shoot, due in 14 days"
import "../src/config.js"; // loads .env
import { draftInvoice } from "../src/draft-invoice.js";
import { createDailyCap, createModel, modelConfig } from "../src/model.js";

try {
  const mc = modelConfig();
  const draft = await draftInvoice(process.argv.slice(2).join(" "), { model: createModel(mc), cap: createDailyCap(mc.dailyLimit) });
  console.log(`Draft (not sent), model ${mc.modelId}:`);
  console.log(JSON.stringify(draft, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
