// Settings from the environment (.env locally). Sandbox only: the app refuses
// to start against live PayPal so a live key can never be used by mistake.
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

export function loadConfig(env = process.env) {
  const paypalEnv = env.PAYPAL_ENV ?? "sandbox";
  if (paypalEnv !== "sandbox") {
    throw new Error(`PAYPAL_ENV is "${paypalEnv}". This app runs against the PayPal sandbox only; set PAYPAL_ENV=sandbox.`);
  }
  const port = Number(env.PORT ?? 3000);
  return {
    baseUrl: SANDBOX_BASE,
    clientId: env.PAYPAL_CLIENT_ID ?? "",
    clientSecret: env.PAYPAL_CLIENT_SECRET ?? "",
    webhookId: env.PAYPAL_WEBHOOK_ID ?? "",
    port,
    // Render sets RENDER_EXTERNAL_URL to the service's public address.
    publicUrl: (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, ""),
    // Where the database, event log and model-usage file live (a persistent disk on Render).
    dataDir: env.DATA_DIR || "var",
    // When set, every page needs this password (any username), except /health and the PayPal webhook.
    demoPassword: env.DEMO_PASSWORD || "",
    // Signs the demo-workspace cookie. Set it on any shared deploy; a random one is used otherwise.
    sessionSecret: env.SESSION_SECRET || randomBytes(32).toString("hex"),
    setAsideRate: Number(env.TAX_SET_ASIDE_RATE ?? 0.25),
  };
}

export function requireCredentials(config) {
  const missing = ["clientId", "clientSecret"].filter((k) => !config[k]);
  if (missing.length) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env (see README: sandbox app setup).");
  }
}

export const dataPath = (config, name) => join(config.dataDir, name);
