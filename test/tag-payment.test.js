import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb } from "../src/db.js";
import { createLedger } from "../src/ledger.js";
import { seedWorkspace } from "../src/seed.js";
import { createTagger, tagWithModel, tagWithRules, OTHER } from "../src/tag-payment.js";
import { createDailyCap } from "../src/model.js";

const WS = "ws_00000000000000aa";
const quiet = { warn() {} };
function setup() {
  const l = createLedger(openDb(":memory:"));
  l.ensureWorkspace(WS);
  seedWorkspace(l, WS);
  l.recordCapture({ id: "O1", status: "COMPLETED", payer: { name: { given_name: "Sandbox", surname: "Buyer" } },
    purchase_units: [{ description: "A3 print: Stoodley Pike", payments: { captures: [{ id: "CAP-T", status: "COMPLETED", custom_id: WS,
      amount: { value: "28.00", currency_code: "GBP" }, create_time: new Date().toISOString() }] } }] });
  return l;
}

test("the model's tag is stored with its reason and model", async () => {
  const l = setup();
  let seen;
  let ex;
  const tag = createTagger({ ledger: l, classify: async (p, cats, examples) => { seen = cats; ex = examples; return { source: "Craft shop", reason: "An A3 print sale.", by: "fake/model:free" }; }, log: quiet });
  await tag(WS, "CAP-T");
  const p = l.payment(WS, "CAP-T");
  assert.deepEqual([p.source, p.source_by, p.source_reason], ["Craft shop", "fake/model:free", "An A3 print sale."]);
  assert.deepEqual(seen, ["Craft shop", "Delivery app", "Photography"]); // the workspace's own categories
  assert.equal(ex["Craft shop"].length, 2); // with two of its own past payments each
  assert.match(ex["Craft shop"][0], /Print/);
});

test("when the model fails, keyword rules tag it instead", async () => {
  const l = setup();
  const tag = createTagger({ ledger: l, classify: async () => { throw new Error("Daily model limit reached"); }, log: quiet });
  await tag(WS, "CAP-T");
  assert.deepEqual([l.payment(WS, "CAP-T").source, l.payment(WS, "CAP-T").source_by], ["Craft shop", "rule"]);
});

test("an existing tag is never overwritten", async () => {
  const l = setup();
  const tag = createTagger({ ledger: l, classify: async () => ({ source: "Other", reason: "x", by: "m" }), log: quiet });
  await tag(WS, "CAP-T");
  assert.equal(await tag(WS, "CAP-T"), null);
  assert.equal(l.payment(WS, "CAP-T").source, "Other");
});

test("rules fall back to Other when nothing matches", () => {
  assert.equal(tagWithRules({ payer: "J. Smith", note: "thanks!" }, ["Craft shop"]).source, OTHER);
  assert.equal(tagWithRules({ payer: "Delivery app weekly payout", note: "" }, ["Delivery app"]).source, "Delivery app");
});

test("the model may only answer with one of the given categories", async () => {
  const cap = createDailyCap(5, join(mkdtempSync(join(tmpdir(), "gm-")), "u.json"));
  let schema;
  const generate = async (args) => { schema = args.output; return { output: { source: "Photography", reason: "Shoot." }, response: { modelId: "m" } }; };
  let prompt;
  const gen2 = async (args) => { prompt = args.prompt; return generate(args); };
  const r = await tagWithModel({ payer: "Brightside Yoga", note: "class photos", amount_pence: 9500, currency: "GBP" }, ["Photography"],
    { examples: { Photography: ["Northside Café: Menu photos"] }, model: {}, cap, generate: gen2 });
  assert.match(prompt, /Photography, e\.g\. "Northside Café: Menu photos"/);
  assert.equal(r.source, "Photography");
  assert.ok(schema);
  assert.equal(cap.used(), 1);
});
