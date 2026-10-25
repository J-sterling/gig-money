// Drafts a polite payment reminder for a sent invoice. Like invoice drafts,
// it never contacts anyone; it waits for the worker's approval.
import { generateText, Output } from "ai";
import { z } from "zod";

export const ReminderDraft = z.object({
  subject: z.string().min(1).max(120),
  note: z.string().min(1).max(600),
});

const instructions = `You write short, friendly payment reminders for a UK gig worker to send to a client.
Keep it polite and specific: name the work, the amount and the due date. Two to four sentences, no threats, no legal language.
Don't include a link; the app adds the PayPal pay link. Sign off with "Thanks" and no name.`;

const fmt = (amount, currency) => Number(amount).toLocaleString("en-GB", { style: "currency", currency });

export async function draftReminder(invoice, { model, cap, today = new Date(), timeoutMs = 20000, generate = generateText }) {
  const d = invoice.draft;
  cap.take();
  const { output, response } = await generate({
    model,
    instructions,
    prompt: `Today is ${today.toISOString().slice(0, 10)}.\nClient: ${d.client_name}\nWork: ${d.description}\nAmount: ${fmt(d.amount, d.currency)}\nDue: ${d.due_date}`,
    output: Output.object({ schema: ReminderDraft }),
    maxRetries: 1,
    timeout: timeoutMs,
  });
  return { reminder: ReminderDraft.parse(output), modelId: response?.modelId ?? null };
}

// Fixed wording for when the model is unavailable.
export function savedReminder(invoice) {
  const d = invoice.draft;
  return {
    subject: `Reminder: ${d.description}`,
    note: `Hi ${d.client_name}, just a friendly reminder that the invoice for ${d.description} (${fmt(d.amount, d.currency)}) was due on ${d.due_date}. You can pay it through PayPal using the link below. Thanks`,
  };
}
