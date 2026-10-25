// Tags where a payment came from (delivery app, shop, a client...), using
// the worker's own categories. The model picks; simple keyword rules take
// over when the model is unavailable, so a payment is never left untagged.
import { generateText, Output } from "ai";
import { z } from "zod";

export const OTHER = "Other";

const instructions = `You sort a UK gig worker's PayPal payments into the categories they already use.
Pick exactly one category from the list given.
Decide from what the payment is for: the note, and the payer only when it is clearly a business (for example a delivery app payout).
Never guess from a person's name. If the note doesn't clearly point to one category, answer "${OTHER}".
In "reason", say in one short sentence which words pointed to that category, or that nothing did.`;

// examples: { category: ["payer: note", ...] } from the worker's own tagged payments.
export async function tagWithModel(payment, categories, { examples = {}, model, cap, timeoutMs = 20000, generate = generateText }) {
  const options = [...new Set([...categories, OTHER])];
  const described = categories.map((c) => `- ${c}${examples[c]?.length ? `, e.g. ${examples[c].map((e) => `"${e}"`).join("; ")}` : ""}`).join("\n");
  cap.take();
  const { output, response } = await generate({
    model,
    instructions,
    prompt: `Categories, with examples of the worker's past payments:\n${described}\n- ${OTHER}\n\nNew payment\nPayer: ${payment.payer ?? "unknown"}\nNote: ${payment.note ?? "none"}\nAmount: ${(payment.amount_pence / 100).toFixed(2)} ${payment.currency}`,
    output: Output.object({ schema: z.object({ source: z.enum(options), reason: z.string().min(1) }) }),
    maxRetries: 1,
    timeout: timeoutMs,
  });
  return { source: output.source, reason: output.reason, by: response?.modelId ?? "model" };
}

// Keyword fallback over the same categories.
const RULES = [
  [/payout|deliver|rider|courier|week \d+/i, "Delivery app"],
  [/print|etsy|shop|order #|a[34]\b/i, "Craft shop"],
  [/photo|shoot|portrait|headshot/i, "Photography"],
];

export function tagWithRules(payment, categories) {
  const text = `${payment.payer ?? ""} ${payment.note ?? ""}`;
  for (const [re, source] of RULES) {
    if (re.test(text) && categories.includes(source)) return { source, reason: `Keyword match in "${text.trim()}".`, by: "rule" };
  }
  return { source: OTHER, reason: "No keyword matched.", by: "rule" };
}

// Tags one payment in the background; logs and falls back, never throws.
export function createTagger({ ledger, classify, log = console }) {
  return async function tag(workspaceId, paymentId) {
    const payment = ledger.payment(workspaceId, paymentId);
    if (!payment || payment.source) return null;
    const categories = ledger.sources(workspaceId).filter((s) => s !== OTHER && s !== "Invoice");
    let result;
    try {
      result = await classify(payment, categories, ledger.examples(workspaceId));
    } catch (err) {
      log.warn(`Tagging ${paymentId} fell back to rules: ${err.message}`);
      result = tagWithRules(payment, categories);
    }
    ledger.setSource(workspaceId, paymentId, result);
    return result;
  };
}
