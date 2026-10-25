import { createApp } from "./app.js";
import { loadConfig, requireCredentials } from "./config.js";
import { createEventLog } from "./events.js";
import { createPayPal } from "./paypal.js";

const config = loadConfig();
requireCredentials(config);
const app = createApp({ paypal: createPayPal(config), config, events: createEventLog() });
app.listen(config.port, () => console.log(`Listening on ${config.publicUrl} (PayPal sandbox)`));
