import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { createEventLog } from "../src/events.js";
import { createLedger } from "../src/ledger.js";

const quiet = { info() {}, warn() {}, error() {} };
let server, base, verifyResult, lastOrder;

// Fake PayPal: remembers the last order's custom_id so capture can echo it back.
const paypal = {
  verifyWebhook: async () => verifyResult,
  createOrder: async (o) => { lastOrder = o; return { id: "ORDER-9", links: [{ rel: "payer-action", href: "https://sandbox.example/approve" }] }; },
  captureOrder: async (id) => ({
    id, status: "COMPLETED", payer: { name: { given_name: "Sandbox", surname: "Buyer" } },
    purchase_units: [{ payments: { captures: [{ id: "CAP-9", status: "COMPLETED", custom_id: lastOrder?.customId,
      amount: { value: "25.00", currency_code: "GBP" }, create_time: new Date().toISOString() }] } }],
  }),
};

before(async () => {
  const events = createEventLog(join(mkdtempSync(join(tmpdir(), "gm-")), "events.jsonl"));
  const ledger = createLedger(openDb(":memory:"));
  const config = { webhookId: "WID", sessionSecret: "test-secret", publicUrl: "http://localhost" };
  const app = createApp({ paypal, config, events, ledger, log: quiet });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const post = (body) => fetch(`${base}/webhooks/paypal`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
const visitor = async () => {
  const res = await fetch(`${base}/api/ledger`);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  return { cookie, ledger: await res.json() };
};
const api = (cookie, path, init = {}) => fetch(`${base}/api${path}`, { ...init, headers: { cookie, "Content-Type": "application/json", ...init.headers } });

test("a verified event is logged once; a retry is a duplicate", async () => {
  verifyResult = true;
  const body = JSON.stringify({ id: "WH-A", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "ORDER-1" } });
  assert.deepEqual(await (await post(body)).json(), { received: true, verified: true });
  assert.deepEqual(await (await post(body)).json(), { received: true, duplicate: true });
  const events = await (await fetch(`${base}/events`)).json();
  assert.equal(events.filter((e) => e.id === "WH-A").length, 1);
});

test("an unverified event is logged as unverified", async () => {
  verifyResult = false;
  const res = await post(JSON.stringify({ id: "WH-B", event_type: "PAYMENT.CAPTURE.COMPLETED" }));
  assert.equal((await res.json()).verified, false);
});

test("a body that isn't JSON is rejected", async () => {
  assert.equal((await post("not json")).status, 400);
});

test("a new visitor gets a signed cookie and a seeded workspace", async () => {
  const { cookie, ledger } = await visitor();
  assert.match(cookie, /^gm_ws=ws_[a-f0-9]{16}\./);
  assert.equal(ledger.payments.length, 10);
  assert.equal(ledger.summary.note, "Estimate, not tax advice.");
});

test("get paid, approve, return: the payment lands in that visitor's ledger only", async () => {
  const a = await visitor();
  const b = await visitor();
  const res = await api(a.cookie, "/get-paid", { method: "POST", body: JSON.stringify({ amount: 25 }) });
  assert.equal((await res.json()).approve_url, "https://sandbox.example/approve");
  assert.match(lastOrder.customId, /^ws_/);
  assert.match(await (await fetch(`${base}/return?token=ORDER-9`)).text(), /payment recorded/);
  const la = await (await api(a.cookie, "/ledger")).json();
  const lb = await (await api(b.cookie, "/ledger")).json();
  assert.equal(la.payments.length, 11);
  assert.equal(la.payments[0].id, "CAP-9");
  assert.equal(lb.payments.length, 10);
});

test("an unverified capture webhook never reaches the ledger", async () => {
  const a = await visitor();
  const ws = decodeURIComponent(a.cookie.split("=")[1]).split(".")[0];
  verifyResult = false;
  await post(JSON.stringify({ id: "WH-C", event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: "CAP-FAKE", custom_id: ws, amount: { value: "999.00", currency_code: "GBP" } } }));
  const l = await (await api(a.cookie, "/ledger")).json();
  assert.equal(l.payments.some((p) => p.id === "CAP-FAKE"), false);
});

test("amounts outside £1–£500 are refused", async () => {
  const a = await visitor();
  assert.equal((await api(a.cookie, "/get-paid", { method: "POST", body: JSON.stringify({ amount: 5000 }) })).status, 400);
});

test("reset puts the workspace back to the seed", async () => {
  const a = await visitor();
  await api(a.cookie, "/get-paid", { method: "POST", body: "{}" });
  await fetch(`${base}/return?token=ORDER-9`);
  await api(a.cookie, "/reset", { method: "POST" });
  assert.equal((await (await api(a.cookie, "/ledger")).json()).payments.length, 10);
});
