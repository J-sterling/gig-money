import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { classifyWithModel, classifyWithRules, tagPayment } from "../src/tasks/tag-payment.js";

const payment = { payer: "Uber Eats", note: "Weekly payout week 44", amount_pence: 3850, currency: "GBP" };
const categories = ["Delivery app", "Craft shop", "Photography"];

// Render runs subtasks for real; here ctx.run calls the task function directly,
// with the model subtask replaced so no network call is made.
function ctxWith(model) {
  const ctx = { run: (def, ...args) => (def === classifyWithModel ? model(...args) : def.func(ctx, ...args)) };
  return ctx;
}

test("tagPayment returns the model's tag when the model answers", async () => {
  const ctx = ctxWith(async () => ({ source: "Delivery app", reason: "A weekly payout.", by: "fake/model:free" }));
  assert.deepEqual(await tagPayment.func(ctx, payment, categories, {}), { source: "Delivery app", reason: "A weekly payout.", by: "fake/model:free" });
});

test("when the model step fails, tagPayment runs the rules step instead", async () => {
  const ctx = ctxWith(async () => { throw new Error("upstream 429"); });
  const r = await tagPayment.func(ctx, payment, categories, {});
  assert.equal(r.source, "Delivery app");
  assert.equal(r.by, "rule");
  assert.match(r.reason, /model was unavailable/);
});

test("the rules step is the same keyword fallback the app uses", () => {
  assert.deepEqual(classifyWithRules.func({}, { payer: "J. Smith", note: "thanks!" }, categories).source, "Other");
});

test("workflow tasks never touch PayPal", () => {
  for (const f of readdirSync(new URL("../src/tasks/", import.meta.url))) {
    assert.doesNotMatch(readFileSync(new URL(`../src/tasks/${f}`, import.meta.url), "utf8"), /paypal/i, f);
  }
});
