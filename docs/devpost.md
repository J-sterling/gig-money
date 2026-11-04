# Devpost submission text: Gig Money

Paste each section into the matching Devpost field. Fill in the `<…>` items on Devpost only, never in this public repo.

---

## Project name
Gig Money

## Tagline (≤ 200 characters)
A PayPal money assistant for gig workers: every payment tagged by AI, tax set aside, and invoices the AI drafts but only you can send.

## Inspiration
Gig Money is built on the PayPal developer platform (Orders v2, Invoicing v2 and verified webhooks, all in the sandbox), with an AI model that tags every payment and drafts invoices and reminders that the worker approves before anything is sent.

Delivery payouts, print sales and the odd photo job all land in one PayPal account. For a multi-app gig worker that means no clear answer to three questions: what's actually mine to spend, how much belongs to the tax office, and who still owes me. Invoicing and chasing late payers eat evenings. We wanted an assistant that does the admin, while the worker stays in control of every message that reaches a client.

General bookkeeping apps typically start from a bank feed, where one PayPal balance fed by three gig apps arrives as a single transfer, so the split between delivery, print and photo income is lost. Gig Money starts from PayPal's own payment events instead: each payment is tagged by source as it is recorded, learning from the worker's own past tags, and invoices the assistant drafts are paid through PayPal Invoicing and flow back into the same ledger.

## What it does
- **Get paid.** A sandbox payment through PayPal Orders is captured and lands in the worker's ledger. PayPal's webhook confirms it, and every webhook is signature-checked before it can touch the ledger. Duplicates are recorded once.
- **AI source tagging.** Each new payment is tagged with where it came from (delivery app, craft shop, photography), using the worker's own past payments as examples. The AI gives its reason, and keyword rules take over if the model is unavailable.
- **Tax set-aside.** It keeps a running estimate (25% of the last 30 days) and shows a "safe to spend" figure, clearly labelled an estimate, not tax advice.
- **AI invoices from one sentence.** "invoice Northside Café £120 for Saturday's shoot, due in 14 days" becomes a schema-checked draft with its reasoning shown.
- **Approval gate.** No invoice or reminder reaches a client or PayPal until the worker approves, and the server refuses anything else. PayPal doesn't email the client; the worker shares the pay link. On approval, PayPal Invoicing creates and issues the invoice and returns a pay link. When it's paid, the income joins the ledger, through the `INVOICING.INVOICE.PAID` webhook or a "Check payment" call to PayPal.
- **AI reminders** for late payers, behind the same gate, and logged with PayPal Invoicing (a copy goes to the worker, who sends the text and pay link).

## How we built it
- **Node 22+ and Express 5.** The ledger is built-in `node:sqlite`, so there's no database to install. The front end is plain JavaScript.
- **PayPal (sandbox):** OAuth client credentials, Orders v2 (create and capture, with the visitor's workspace in `custom_id`), Invoicing v2 (create, send with a pay link, status, remind), webhooks, and verify-webhook-signature.
- **AI:** a free model on OpenRouter through the Vercel AI SDK, with structured output validated by Zod, a 20-second timeout, a daily call cap, and labelled fallbacks so the demo never breaks.
- **Render:** two services from one Blueprint.
  - The web service has a persistent disk for the SQLite ledger and a health check.
  - A **Render Workflow** runs payment tagging: a `tagPayment` task chains a model step and a rules step, each visible in the Render dashboard, and the ledger row records the run id.
  - Secrets go from an Ansible vault to Render through a playbook.
- **Safety and quality:**
  - 92 offline tests, with PayPal and the model faked.
  - A daily health check that fails if the AI or the Workflow stops answering.
  - gitleaks secret scanning before every commit and in CI.
  - Security scanning adapted from our homelab security pipeline: Semgrep and Trivy on every push, plus a weekly passive OWASP ZAP scan of the live demo, which led us to add a strict Content-Security-Policy and other security headers.
  - AI guardrails: payer and user text is fenced off as data, and the app re-checks every model answer itself (only the worker's categories, an amount cap, no web links, no invented client emails). `test/injection.test.js` plays a fooled model to prove it.
  - See `SECURITY.md`.

## Challenges we ran into
- **Free models are flaky and rate-limited.** We added a timeout, a daily cap and clearly labelled saved examples, so the demo still works when the model doesn't.
- **A free model sometimes picked a category its own reason contradicted.** Asking for the reason before the category fixed it.
- **Render Workflows:** the SDK's wait call never returned against the live API, so we poll the run status. A workflow's env vars can't be changed through the API, so the model key lives in an env group.
- **Getting PayPal webhooks right:** verifying signatures on the raw bytes, and recording a payment once when both the capture reply and its webhook arrive.

## Accomplishments that we're proud of
The full loop runs live on the hosted demo:
1. a sandbox payment is captured and tagged by the AI through a Render Workflow;
2. an AI-drafted invoice is approved, issued through PayPal Invoicing and paid by the sandbox buyer;
3. every PayPal webhook is verified.

The approval gate is enforced by the server, not just the UI.

## What we learned
Human-in-the-loop design matters most when money is involved: the AI is most useful when it drafts and explains, and the person decides. We also learned to design for the model failing, not just succeeding.

## What's next for Gig Money
- A month-end summary using PayPal transaction history.
- Smarter reminders (an overdue scan that drafts into the approval queue, still never sending on its own).
- More tax-year views for UK Self Assessment.
- Production PayPal once the safety model is reviewed.

## Built with
`node.js` `express` `sqlite` `javascript` `paypal-orders-api` `paypal-invoicing-api` `paypal-webhooks` `openrouter` `vercel-ai-sdk` `zod` `render` `render-workflows` `ansible` `github-actions` `semgrep` `trivy` `owasp-zap`

## Tools: which AI and how it's used
- **Model:** a free model on OpenRouter (`nvidia/nemotron-3.5-super-vl:free`, with `google/gemma-4-31b-it:free` as fallback), called through the Vercel AI SDK with Zod-validated structured output.
- **Used for:**
  1. tagging each payment's source from the worker's own categories and past payments, with a reason (it runs in a Render Workflow);
  2. turning a one-sentence request into an invoice draft;
  3. drafting payment reminders.
- **Limits:** the AI never sends anything. Every invoice and reminder waits for the worker's approval, enforced on the server.
- **Development:** Claude Code was used as a coding assistant.

## Links
- Hosted demo: https://gig-money-7c79.onrender.com
- Code: https://github.com/J-sterling/gig-money (Apache-2.0)
- Video: https://youtu.be/iN1purYxrCM

## Testing instructions (Devpost "testing instructions" field; fill in on Devpost only)
```
Hosted demo: https://gig-money-7c79.onrender.com
Demo password: <demo password>   (any username works)
PayPal sandbox buyer: <sandbox buyer email> / <sandbox buyer password>
Everything runs in the PayPal sandbox; no real money moves.

1. You get your own workspace with a month of example income.
2. Get paid: approve the sandbox payment on PayPal as the sandbox buyer. It lands in your ledger and the AI tags its source.
3. Ask for an invoice in a sentence, e.g. "invoice Northside Café (cafe@example.com) £120 for Saturday's shoot, due in 14 days". The AI drafts it.
4. Approve and send: PayPal Invoicing creates it and gives a pay link. Open it, pay as the sandbox buyer, then click Check payment.
5. Draft reminder on a sent invoice, then approve it. "Reset my demo" starts over.

The free model allows about 40 calls a day for everyone (resets 00:00 UTC). After that, or if it's busy, you'll see a clearly labelled saved example, which you can still approve.
To run it locally instead, follow "Run it" in the README.
```
