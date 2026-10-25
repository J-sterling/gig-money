import { createApp } from "./app.js";
import { dataPath, loadConfig, requireCredentials } from "./config.js";
import { openDb } from "./db.js";
import { draftInvoice } from "./draft-invoice.js";
import { draftReminder } from "./draft-reminder.js";
import { createTagger, tagWithModel } from "./tag-payment.js";
import { createEventLog } from "./events.js";
import { createInvoiceBook } from "./invoices.js";
import { createLedger } from "./ledger.js";
import { createDailyCap, createModel, modelConfig } from "./model.js";
import { createPayPal } from "./paypal.js";

const config = loadConfig();
requireCredentials(config);
if (!process.env.SESSION_SECRET) console.warn("SESSION_SECRET is not set; visitors get a new demo workspace each time the server restarts.");
const db = openDb(dataPath(config, "gig-money.db"));
const paypal = createPayPal(config);
const ledger = createLedger(db, { setAsideRate: config.setAsideRate });
const invoices = createInvoiceBook(db, { paypal, ledger });

const mc = modelConfig();
const cap = createDailyCap(mc.dailyLimit, dataPath(config, "model-usage.json"));
const model = mc.apiKey ? createModel(mc) : null;
if (!model) console.warn("OPENROUTER_API_KEY is not set; invoice drafts use the saved example.");
const drafter = (request) => {
  if (!model) throw new Error("OPENROUTER_API_KEY is not set");
  return draftInvoice(request, { model, cap, timeoutMs: mc.timeoutMs });
};

const needModel = () => { if (!model) throw new Error("OPENROUTER_API_KEY is not set"); };
const reminderDrafter = (invoice) => { needModel(); return draftReminder(invoice, { model, cap, timeoutMs: mc.timeoutMs }); };
const tag = createTagger({
  ledger,
  classify: (payment, categories, examples) => { needModel(); return tagWithModel(payment, categories, { examples, model, cap, timeoutMs: mc.timeoutMs }); },
});

const app = createApp({ paypal, config, events: createEventLog(dataPath(config, "events.jsonl")), ledger, invoices, drafter, reminderDrafter, tag });
if (!config.demoPassword && config.publicUrl.startsWith("https://")) console.warn("DEMO_PASSWORD is not set on a public URL: anyone with the link can use the demo.");
app.listen(config.port, () => console.log(`Listening on ${config.publicUrl} (PayPal sandbox; data in ${config.dataDir}${config.demoPassword ? "; password required" : ""})`));
