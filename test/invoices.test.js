import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../src/db.js";
import { createInvoiceBook, GateError } from "../src/invoices.js";
import { createLedger } from "../src/ledger.js";

const WS = "ws_00000000000000aa", OTHER = "ws_00000000000000bb";
const now = () => new Date("2026-11-07T12:00:00Z");
const draft = { client_name: "Northside Café", client_email: null, amount: 120, currency: "GBP", description: "Saturday shoot", due_date: "2026-11-21" };

function setup({ failCreate = false } = {}) {
  const calls = [];
  const paypal = {
    createInvoice: async (a) => { calls.push(["create", a]); if (failCreate) throw new Error("HTTP 403 NOT_AUTHORIZED"); return { id: "INV2-TEST-1" }; },
    sendInvoice: async (id) => { calls.push(["send", id]); return { rel: "payer-view", href: "https://www.sandbox.paypal.com/invoice/p/#INV2-TEST-1" }; },
    getInvoice: async (id) => { calls.push(["get", id]); return { id, status: "PAID", payments: { paid_amount: { value: "120.00", currency_code: "GBP" }, transactions: [{ payment_id: "PAY-1", payment_date: "2026-11-08" }] } }; },
  };
  const db = openDb(":memory:");
  const ledger = createLedger(db, { now });
  ledger.ensureWorkspace(WS); ledger.ensureWorkspace(OTHER);
  return { book: createInvoiceBook(db, { paypal, ledger, now }), ledger, calls };
}

test("making a draft never calls PayPal (N4)", () => {
  const { book, calls } = setup();
  const inv = book.create(WS, { request: "invoice…", draft, draftedBy: "fake/model:free", reason: "ok" });
  assert.equal(inv.status, "draft");
  assert.equal(calls.length, 0);
});

test("approving creates and sends the invoice with the workspace as its reference", async () => {
  const { book, calls } = setup();
  const inv = book.create(WS, { draft, draftedBy: "m" });
  const out = await book.approve(WS, inv.id);
  assert.equal(out.status, "sent");
  assert.equal(out.paypal_id, "INV2-TEST-1");
  assert.match(out.pay_url, /sandbox\.paypal\.com/);
  assert.deepEqual(calls.map((c) => c[0]), ["create", "send"]);
  assert.equal(calls[0][1].reference, WS);
});

test("a draft can't be approved twice, or approved after rejection (N4)", async () => {
  const { book, calls } = setup();
  const a = book.create(WS, { draft, draftedBy: "m" });
  await book.approve(WS, a.id);
  await assert.rejects(book.approve(WS, a.id), (e) => e instanceof GateError && e.status === 409);
  const b = book.create(WS, { draft, draftedBy: "m" });
  book.reject(WS, b.id, "wrong client");
  await assert.rejects(book.approve(WS, b.id), (e) => e.status === 409);
  assert.equal(calls.filter((c) => c[0] === "send").length, 1);
});

test("another workspace can't approve or even see the draft", async () => {
  const { book, calls } = setup();
  const inv = book.create(WS, { draft, draftedBy: "m" });
  await assert.rejects(book.approve(OTHER, inv.id), (e) => e.status === 404);
  assert.equal(book.list(OTHER).length, 0);
  assert.equal(calls.length, 0);
});

test("edits are validated before anything is sent", async () => {
  const { book, calls } = setup();
  const inv = book.create(WS, { draft, draftedBy: "m" });
  await assert.rejects(book.approve(WS, inv.id, { amount: -1 }), (e) => e.status === 400);
  await assert.rejects(book.approve(WS, inv.id, { due_date: "2026-10-01" }), /in the past/);
  assert.equal(calls.length, 0);
  const out = await book.approve(WS, inv.id, { amount: 150, client_name: "Northside Café Ltd" });
  assert.equal(out.draft.amount, 150);
  assert.equal(calls[0][1].amount, 150);
});

test("a failed send is recorded and can be retried", async () => {
  const { book } = setup({ failCreate: true });
  const inv = book.create(WS, { draft, draftedBy: "m" });
  await assert.rejects(book.approve(WS, inv.id), (e) => e.status === 502);
  assert.equal(book.list(WS)[0].status, "failed");
});

test("checking with PayPal marks it paid and adds the income to the ledger once", async () => {
  const { book, ledger } = setup();
  const inv = book.create(WS, { draft, draftedBy: "m" });
  await book.approve(WS, inv.id);
  assert.equal((await book.refresh(WS, inv.id)).status, "paid");
  await book.refresh(WS, inv.id);
  const pays = ledger.payments(WS);
  assert.equal(pays.length, 1);
  assert.equal(pays[0].amount_pence, 12000);
  assert.equal(pays[0].source, "Invoice");
});

test("a paid webhook only counts for the invoice's own workspace", async () => {
  const { book, ledger } = setup();
  const inv = book.create(WS, { draft, draftedBy: "m" });
  await book.approve(WS, inv.id);
  assert.equal(book.recordPaidWebhook({ resource: { invoice: { id: "INV2-TEST-1", detail: { reference: OTHER } } } }).recorded, false);
  assert.equal(book.recordPaidWebhook({ resource: { invoice: { id: "INV2-TEST-1", detail: { reference: WS } } } }).recorded, true);
  assert.equal(ledger.payments(WS).length, 1);
});
