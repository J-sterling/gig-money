import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createDailyCap } from "../src/model.js";
import { chooseClassify, createRemoteClassify } from "../src/workflow-client.js";

const row = { id: "CAP-1", workspace_id: "ws_00000000000000aa", order_id: "O1", payer: "Uber Eats", note: "Weekly payout", amount_pence: 3850, currency: "GBP", captured_at: "2026-11-02" };
const cats = ["Delivery app", "Photography"];
const capOf = (limit = 5) => createDailyCap(limit, join(mkdtempSync(join(tmpdir(), "gm-")), "u.json"));

// Fake Render workflows client: records what was started and answers like the SDK does.
function fakeWorkflows(answer) {
  const calls = { started: [], cancelled: [] };
  return {
    calls,
    async startTask(slug, input) {
      calls.started.push({ slug, input });
      return { taskRunId: "trn-test1", get: () => answer() };
    },
    async cancelTaskRun(id) { calls.cancelled.push(id); },
  };
}

test("a completed run's tag comes back with its Render run id, and the call is counted once", async () => {
  const cap = capOf();
  const wf = fakeWorkflows(async () => ({ status: "completed", results: [{ source: "Delivery app", reason: "A payout.", by: "m:free" }] }));
  const r = await createRemoteClassify({ workflows: wf, taskSlug: "gig-money-workflows/tagPayment", cap })(row, cats, { "Delivery app": ["Deliveroo: payout"] });
  assert.deepEqual(r, { source: "Delivery app", reason: "A payout. · Render run trn-test1", by: "m:free" });
  assert.equal(cap.used(), 1);
  assert.equal(wf.calls.started[0].slug, "gig-money-workflows/tagPayment");
});

test("only the payment's text fields are sent to the run", async () => {
  const wf = fakeWorkflows(async () => ({ status: "completed", results: [{ source: "Other", reason: "x", by: "m" }] }));
  await createRemoteClassify({ workflows: wf, taskSlug: "w/tagPayment", cap: capOf() })(row, cats, {});
  assert.deepEqual(wf.calls.started[0].input[0], { payer: "Uber Eats", note: "Weekly payout", amount_pence: 3850, currency: "GBP" });
});

test("a failed run throws, so the app tags with rules", async () => {
  const wf = fakeWorkflows(async () => ({ status: "failed", error: "upstream 429", results: null }));
  await assert.rejects(createRemoteClassify({ workflows: wf, taskSlug: "w/tagPayment", cap: capOf() })(row, cats, {}), /trn-test1 failed: upstream 429/);
});

test("a run that takes too long is cancelled and throws", async () => {
  const wf = fakeWorkflows(() => new Promise(() => {}));
  await assert.rejects(createRemoteClassify({ workflows: wf, taskSlug: "w/tagPayment", cap: capOf(), timeoutMs: 20 })(row, cats, {}), /took over/);
  assert.deepEqual(wf.calls.cancelled, ["trn-test1"]);
});

test("when the day's model calls are used up, no run is started", async () => {
  const cap = capOf(1);
  cap.take();
  const wf = fakeWorkflows(async () => ({ status: "completed", results: [] }));
  await assert.rejects(createRemoteClassify({ workflows: wf, taskSlug: "w/tagPayment", cap })(row, cats, {}), /Daily model limit/);
  assert.equal(wf.calls.started.length, 0);
});

test("tagging stays in-process unless both Render settings are present", () => {
  const local = () => "local";
  const made = [];
  const makeRemote = ({ taskSlug, token }) => { made.push([taskSlug, token]); return () => "remote"; };
  assert.equal(chooseClassify({}, { local, makeRemote }), local);
  assert.equal(chooseClassify({ RENDER_TAG_TASK: "w/tagPayment" }, { local, makeRemote }), local);
  assert.equal(chooseClassify({ RENDER_API_KEY: "k", RENDER_TAG_TASK: "w/tagPayment" }, { local, makeRemote }), local); // the CLI's key never switches it on
  assert.equal(chooseClassify({ RENDER_TAG_TASK: "w/tagPayment", RENDER_WORKFLOW_API_KEY: "k" }, { local, makeRemote })(), "remote");
  assert.deepEqual(made, [["w/tagPayment", "k"]]);
});
