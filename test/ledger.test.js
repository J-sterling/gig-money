import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../src/db.js";
import { createLedger, TAX_NOTE } from "../src/ledger.js";
import { seedWorkspace } from "../src/seed.js";

const now = () => new Date("2026-11-07T12:00:00Z");
const setup = () => { const l = createLedger(openDb(":memory:"), { now }); l.ensureWorkspace("ws_00000000000000aa"); return l; };

// Shaped like PayPal's capture reply and PAYMENT.CAPTURE.COMPLETED webhook.
const captured = (ws, captureId = "CAP-1") => ({
  id: "ORDER-1", status: "COMPLETED",
  payer: { name: { given_name: "Sandbox", surname: "Buyer" }, email_address: "buyer@personal.example.com" },
  purchase_units: [{ description: "Gig Money demo payment", payments: { captures: [
    { id: captureId, status: "COMPLETED", custom_id: ws, amount: { value: "25.00", currency_code: "GBP" }, create_time: "2026-11-07T11:00:00Z" },
  ] } }],
});
const webhook = (ws, captureId = "CAP-1") => ({
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: { id: captureId, custom_id: ws, amount: { value: "25.00", currency_code: "GBP" }, create_time: "2026-11-07T11:00:00Z",
    supplementary_data: { related_ids: { order_id: "ORDER-1" } } },
});

test("a capture reply is recorded in pence with the payer", () => {
  const l = setup();
  assert.equal(l.recordCapture(captured("ws_00000000000000aa")).recorded, true);
  const [p] = l.payments("ws_00000000000000aa");
  assert.equal(p.amount_pence, 2500);
  assert.equal(p.payer, "Sandbox Buyer");
  assert.equal(p.recorded_via, "capture");
});

test("the capture reply and its webhook record the payment once", () => {
  const l = setup();
  l.recordCapture(captured("ws_00000000000000aa"));
  const again = l.recordWebhook(webhook("ws_00000000000000aa"));
  assert.equal(again.recorded, false);
  assert.equal(again.reason, "already recorded");
  assert.equal(l.payments("ws_00000000000000aa").length, 1);
});

test("a webhook on its own records the payment", () => {
  const l = setup();
  assert.equal(l.recordWebhook(webhook("ws_00000000000000aa", "CAP-9")).recorded, true);
  assert.equal(l.payments("ws_00000000000000aa")[0].order_id, "ORDER-1");
});

test("payments for unknown or malformed workspaces are ignored", () => {
  const l = setup();
  assert.equal(l.recordCapture(captured("ws_00000000000000bb")).reason, "unknown workspace");
  assert.equal(l.recordWebhook(webhook("not-a-workspace")).reason, "unknown workspace");
  assert.equal(l.recordCapture({ purchase_units: [{ payments: { captures: [{ status: "PENDING" }] } }] }).reason, "capture not completed");
});

test("the seed gives each workspace its own month of income, and reset restores it", () => {
  const l = setup();
  l.ensureWorkspace("ws_00000000000000bb");
  const n = seedWorkspace(l, "ws_00000000000000aa", now());
  seedWorkspace(l, "ws_00000000000000bb", now());
  assert.equal(l.payments("ws_00000000000000aa").length, n);
  l.recordCapture(captured("ws_00000000000000aa"));
  assert.equal(l.payments("ws_00000000000000bb").length, n); // untouched
  l.reset("ws_00000000000000aa");
  assert.equal(l.payments("ws_00000000000000aa").length, 0);
});

test("summary covers the last 30 days and labels the tax figure an estimate", () => {
  const l = setup();
  seedWorkspace(l, "ws_00000000000000aa", now());
  const s = l.summary("ws_00000000000000aa");
  assert.equal(s.earned_pence, 111870);
  assert.equal(s.set_aside_pence, 27968); // 25%, rounded
  assert.equal(s.safe_to_spend_pence, 111870 - 27968);
  assert.equal(s.note, TAX_NOTE);
});
