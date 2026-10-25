import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { createEventLog } from "../src/events.js";

const quiet = { info() {}, warn() {}, error() {} };
let server, base, verifyResult;

before(async () => {
  const paypal = { verifyWebhook: async () => verifyResult, captureOrder: async (id) => ({ id, status: "COMPLETED" }) };
  const events = createEventLog(join(mkdtempSync(join(tmpdir(), "gm-")), "events.jsonl"));
  const app = createApp({ paypal, config: { webhookId: "WID" }, events, log: quiet });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const post = (body) => fetch(`${base}/webhooks/paypal`, { method: "POST", headers: { "Content-Type": "application/json" }, body });

test("a verified event is logged once; a retry is a duplicate", async () => {
  verifyResult = true;
  const body = JSON.stringify({ id: "WH-A", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-1" } });
  assert.deepEqual(await (await post(body)).json(), { received: true, verified: true });
  assert.deepEqual(await (await post(body)).json(), { received: true, duplicate: true });
  const events = await (await fetch(`${base}/events`)).json();
  assert.equal(events.filter((e) => e.id === "WH-A").length, 1);
  assert.equal(events[0].resource_id, "CAP-1");
});

test("an unverified event is logged as unverified", async () => {
  verifyResult = false;
  const res = await post(JSON.stringify({ id: "WH-B", event_type: "PAYMENT.CAPTURE.COMPLETED" }));
  assert.equal((await res.json()).verified, false);
  const events = await (await fetch(`${base}/events`)).json();
  assert.equal(events.find((e) => e.id === "WH-B").verified, false);
});

test("a body that isn't JSON is rejected", async () => {
  assert.equal((await post("not json")).status, 400);
});

test("returning from PayPal captures the order", async () => {
  const res = await fetch(`${base}/return?token=ORDER-9`);
  assert.match(await res.text(), /ORDER-9 completed/);
});
