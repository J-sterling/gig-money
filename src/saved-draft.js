// When the free model is slow, out of calls or not set up, the worker still
// gets a draft (N17): a fixed example, clearly labelled, that they can edit
// and approve, so the PayPal half of the demo always works.
const addDays = (d, n) => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);

export function savedDraft(why, today = new Date()) {
  return {
    draft: {
      client_name: "Northside Café", client_email: null, amount: 120, currency: "GBP",
      description: "Photography: Saturday shoot", due_date: addDays(today, 14),
      reason: `Saved example, not read from your request: ${why}. Edit it before approving.`,
    },
    draftedBy: "saved example",
  };
}

// Plain-language reason for the label, from whatever went wrong.
export function whyNoModel(err) {
  const m = String(err?.message ?? err ?? "");
  if (/OPENROUTER_API_KEY/.test(m)) return "no model key is set up";
  if (/Daily model limit/.test(m)) return "today's free model limit is used up";
  if (/abort|timeout|timed out/i.test(m)) return "the free model took too long to answer";
  if (/rate.?limit|429/i.test(m)) return "the free model is busy right now";
  return "the free model didn't answer";
}
