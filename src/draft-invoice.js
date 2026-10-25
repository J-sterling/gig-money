// Turns a sentence into a structured invoice draft. Returns { draft, modelId }
// (modelId is the model that actually answered). It never contacts PayPal:
// sending happens only after the worker approves the draft (N4).
import { generateText, Output } from "ai";
import { z } from "zod";

export const InvoiceDraft = z.object({
  client_name: z.string().min(1).describe("Who the invoice is for"),
  client_email: z.string().email().nullable().describe("Client email if given, else null"),
  amount: z.number().positive().describe("Amount before tax, as a number"),
  currency: z.enum(["GBP", "EUR", "USD"]),
  description: z.string().min(1).describe("Line item, e.g. 'Photography: Saturday shoot'"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
  reason: z.string().min(1).describe("One sentence on how the request was read, for the worker to check"),
});

const instructions = `You draft invoices for a UK gig worker who is paid through PayPal.
Read the request and fill every field. Use GBP unless another currency is named.
Work out the due date from today's date when it is given as a number of days; if none is given, use 14 days.
Never invent an email address: use null if the request doesn't contain one.
In "reason", say in one plain sentence what you understood, so the worker can spot a mistake.`;

export async function draftInvoice(request, { model, cap, today = new Date(), timeoutMs = 20000, generate = generateText }) {
  const text = String(request ?? "").trim();
  if (!text) throw new Error("Describe the invoice, e.g. \"invoice Northside Café £120 for Saturday's shoot, due in 14 days\".");
  if (text.length > 500) throw new Error("Keep the request under 500 characters.");
  cap.take();
  const { output, response } = await generate({
    model,
    instructions,
    prompt: `Today is ${today.toISOString().slice(0, 10)}.\nRequest: ${text}`,
    output: Output.object({ schema: InvoiceDraft }),
    maxRetries: 1,
    timeout: timeoutMs,
  });
  const draft = InvoiceDraft.parse(output);
  if (draft.due_date < today.toISOString().slice(0, 10)) throw new Error(`The model gave a due date in the past (${draft.due_date}). Try again with the due date spelled out.`);
  return { draft, modelId: response?.modelId ?? null };
}
