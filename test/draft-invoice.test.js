import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { draftInvoice } from "../src/draft-invoice.js";
import { createDailyCap, createModel, modelConfig, DEFAULT_MODEL } from "../src/model.js";

const today = new Date("2026-11-07T10:00:00Z");
const good = {
  client_name: "Northside Café", client_email: null, amount: 120, currency: "GBP",
  description: "Photography: Saturday shoot", due_date: "2026-11-21", reason: "£120 for Saturday's shoot, due in 14 days.",
};
const tmpCap = (limit = 5) => createDailyCap(limit, join(mkdtempSync(join(tmpdir(), "gm-")), "usage.json"), () => "2026-11-07");
const fake = (output) => { const calls = []; const generate = async (args) => { calls.push(args); return { output, response: { modelId: "fake/model:free" } }; }; return { generate, calls }; };

test("returns a validated draft and tells the model today's date", async () => {
  const { generate, calls } = fake(good);
  const { draft, modelId } = await draftInvoice("invoice Northside Café £120 for Saturday's shoot, due in 14 days", { model: {}, cap: tmpCap(), today, generate });
  assert.deepEqual(draft, good);
  assert.equal(modelId, "fake/model:free");
  assert.match(calls[0].prompt, /Today is 2026-11-07/);
  assert.equal(calls[0].timeout, 20000);
});

test("rejects a draft that breaks the schema", async () => {
  const { generate } = fake({ ...good, amount: -5 });
  await assert.rejects(draftInvoice("invoice", { model: {}, cap: tmpCap(), today, generate }));
});

test("rejects a due date in the past", async () => {
  const { generate } = fake({ ...good, due_date: "2026-10-01" });
  await assert.rejects(draftInvoice("invoice", { model: {}, cap: tmpCap(), today, generate }), /in the past/);
});

test("refuses empty requests without calling the model", async () => {
  const { generate, calls } = fake(good);
  await assert.rejects(draftInvoice("  ", { model: {}, cap: tmpCap(), today, generate }), /Describe the invoice/);
  assert.equal(calls.length, 0);
});

test("the daily cap stops calls once reached", async () => {
  const cap = tmpCap(2);
  const { generate } = fake(good);
  await draftInvoice("a", { model: {}, cap, today, generate });
  await draftInvoice("b", { model: {}, cap, today, generate });
  await assert.rejects(draftInvoice("c", { model: {}, cap, today, generate }), /Daily model limit reached/);
  assert.equal(cap.used(), 2);
});

test("defaults to a list of free models and needs a key", () => {
  assert.equal(modelConfig({}).modelId, DEFAULT_MODEL);
  assert.deepEqual(modelConfig({ MODEL: "a:free, b:free" }).models, ["a:free", "b:free"]);
  assert.throws(() => createModel(modelConfig({})), /OPENROUTER_API_KEY/);
});
