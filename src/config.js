// Settings from the environment (.env locally). Sandbox only: the app refuses
// to start against live PayPal so a live key can never be used by mistake.
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
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ""),
  };
}

export function requireCredentials(config) {
  const missing = ["clientId", "clientSecret"].filter((k) => !config[k]);
  if (missing.length) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env (see README: sandbox app setup).");
  }
}
