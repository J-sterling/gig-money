import { createApp } from "./app.js";
import { loadConfig, requireCredentials } from "./config.js";
import { openDb } from "./db.js";
import { createEventLog } from "./events.js";
import { createLedger } from "./ledger.js";
import { createPayPal } from "./paypal.js";

const config = loadConfig();
requireCredentials(config);
if (!process.env.SESSION_SECRET) console.warn("SESSION_SECRET is not set; visitors get a new demo workspace each time the server restarts.");
const ledger = createLedger(openDb(), { setAsideRate: config.setAsideRate });
const app = createApp({ paypal: createPayPal(config), config, events: createEventLog(), ledger });
app.listen(config.port, () => console.log(`Listening on ${config.publicUrl} (PayPal sandbox)`));
