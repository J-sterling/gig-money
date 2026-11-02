// Render Workflow tasks that tag one payment's source. They run on Render's
// workflow service, which has no disk, no ledger and no payment secrets: a
// run gets the payment's text fields and the worker's categories, and returns
// a tag for the web service to store. Each run shows its steps in the Render
// dashboard: the model step, then the rules step if the model failed.
import { task } from "@renderinc/sdk/workflows";
import { createModel, modelConfig } from "../model.js";
import { tagWithModel, tagWithRules } from "../tag-payment.js";

// The web service counts the call against the daily cap before starting the
// run, so the task doesn't count it again. One model call per run, no retries.
const counted = { take() {} };

export const classifyWithModel = task({ name: "classifyWithModel", retry: { maxRetries: 0 } }, async (_ctx, payment, categories, examples) => {
  const mc = modelConfig();
  return tagWithModel(payment, categories, { examples, model: createModel(mc), cap: counted, timeoutMs: mc.timeoutMs, maxRetries: 0 });
});

export const classifyWithRules = task({ name: "classifyWithRules", retry: { maxRetries: 0 } }, (_ctx, payment, categories) => tagWithRules(payment, categories));

export const tagPayment = task({ name: "tagPayment", retry: { maxRetries: 0 } }, async (ctx, payment, categories, examples) => {
  try {
    return await ctx.run(classifyWithModel, payment, categories, examples);
  } catch {
    const r = await ctx.run(classifyWithRules, payment, categories);
    return { ...r, reason: `${r.reason} The model was unavailable.` };
  }
});
