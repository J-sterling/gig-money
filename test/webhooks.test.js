import assert from "node:assert/strict";
import { test } from "node:test";
import { PayPalError } from "../src/paypal.js";
import { registerWebhook, removeWebhook } from "../src/webhooks.js";

const URL = "https://mac.example.ts.net/webhooks/paypal";

test("registers a new webhook at <base>/webhooks/paypal", async () => {
  const paypal = { createWebhook: async (url) => ({ id: "WH-NEW", url }) };
  assert.deepEqual(await registerWebhook(paypal, "https://mac.example.ts.net/"), { id: "WH-NEW", url: URL, reused: false });
});

test("re-running reuses the webhook PayPal already has for the URL", async () => {
  const paypal = {
    createWebhook: async () => { throw new PayPalError(400, { name: "WEBHOOK_URL_ALREADY_EXISTS" }, "Registering the webhook"); },
    listWebhooks: async () => ({ webhooks: [{ id: "WH-OTHER", url: "https://x.test/webhooks/paypal" }, { id: "WH-OLD", url: URL }] }),
  };
  assert.deepEqual(await registerWebhook(paypal, "https://mac.example.ts.net"), { id: "WH-OLD", url: URL, reused: true });
});

test("other registration errors are not swallowed", async () => {
  const paypal = { createWebhook: async () => { throw new PayPalError(400, { name: "INVALID_REQUEST" }, "Registering the webhook"); } };
  await assert.rejects(registerWebhook(paypal, "https://mac.example.ts.net"), /INVALID_REQUEST/);
});

test("removing is safe when PayPal no longer has the webhook", async () => {
  assert.equal(await removeWebhook({ deleteWebhook: async () => ({}) }, "WH-1"), true);
  const gone = { deleteWebhook: async () => { throw new PayPalError(404, { name: "INVALID_RESOURCE_ID" }, "Removing the webhook"); } };
  assert.equal(await removeWebhook(gone, "WH-1"), false);
});
