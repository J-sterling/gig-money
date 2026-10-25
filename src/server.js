import { createApp } from "./app.js";
import { loadConfig, requireCredentials } from "./config.js";
import { openDb } from "./db.js";
import { draftInvoice } from "./draft-invoice.js";
import { createEventLog } from "./events.js";
import { createInvoiceBook } from "./invoices.js";
import { createLedger } from "./ledger.js";
import { createDailyCap, createModel, modelConfig } from "./model.js";
import { createPayPal } from "./paypal.js";

const config = loadConfig();
requireCredentials(config);
if (!process.env.SESSION_SECRET) console.warn("SESSION_SECRET is not set; visitors get a new demo workspace each time the server restarts.");
const db = openDb();
const paypal = createPayPal(config);
const ledger = createLedger(db, { setAsideRate: config.setAsideRate });
const invoices = createInvoiceBook(db, { paypal, ledger });

const mc = modelConfig();
const cap = createDailyCap(mc.dailyLimit);
const model = mc.apiKey ? createModel(mc) : null;
if (!model) console.warn("OPENROUTER_API_KEY is not set; invoice drafts use the saved example.");
const drafter = (request) => {
  if (!model) throw new Error("OPENROUTER_API_KEY is not set");
  return draftInvoice(request, { model, cap, timeoutMs: mc.timeoutMs });
};

const app = createApp({ paypal, config, events: createEventLog(), ledger, invoices, drafter });
app.listen(config.port, () => console.log(`Listening on ${config.publicUrl} (PayPal sandbox)`));
