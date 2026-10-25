import assert from "node:assert/strict";
import { test } from "node:test";
import { createPayPal, PayPalError } from "../src/paypal.js";

function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, ...init });
    const path = new URL(url).pathname;
    const [status, body] = routes[path] ?? [404, { name: "NOT_FOUND" }];
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { fetch, calls };
}

const tokenRoute = { "/v1/oauth2/token": [200, { access_token: "tok", expires_in: 3600 }] };

test("caches the token until it is about to expire", async () => {
  let t = 0;
  const { fetch, calls } = fakeFetch({ ...tokenRoute, "/v1/notifications/webhooks": [200, { webhooks: [] }] });
  const pp = createPayPal({ baseUrl: "https://x.test", clientId: "id", clientSecret: "s", fetch, now: () => t });
  await pp.listWebhooks();
  await pp.listWebhooks();
  assert.equal(calls.filter((c) => c.url.endsWith("/oauth2/token")).length, 1);
  t = 3600 * 1000; // past expiry
  await pp.listWebhooks();
  assert.equal(calls.filter((c) => c.url.endsWith("/oauth2/token")).length, 2);
});

test("a bad secret gives a PayPalError with status 401", async () => {
  const { fetch } = fakeFetch({ "/v1/oauth2/token": [401, { error: "invalid_client", error_description: "Client Authentication failed" }] });
  const pp = createPayPal({ baseUrl: "https://x.test", clientId: "id", clientSecret: "bad", fetch });
  await assert.rejects(pp.getToken(), (e) => e instanceof PayPalError && e.status === 401);
});

test("verifyWebhook sends the raw event bytes unchanged", async () => {
  const { fetch, calls } = fakeFetch({ ...tokenRoute, "/v1/notifications/verify-webhook-signature": [200, { verification_status: "SUCCESS" }] });
  const pp = createPayPal({ baseUrl: "https://x.test", clientId: "id", clientSecret: "s", fetch });
  const rawBody = '{"id":"WH-1",  "event_type":"PAYMENT.CAPTURE.COMPLETED"}'; // odd spacing on purpose
  const ok = await pp.verifyWebhook({ headers: { "paypal-transmission-id": "t1" }, rawBody, webhookId: "WID" });
  assert.equal(ok, true);
  const sent = calls.at(-1).body;
  assert.ok(sent.endsWith(`"webhook_event":${rawBody}}`));
  assert.equal(JSON.parse(sent).webhook_id, "WID");
});
