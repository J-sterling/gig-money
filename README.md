# Gig Money

A PayPal money assistant for gig workers. Payments arrive from PayPal by webhook and go into a ledger. The AI tags where each one came from, keeps a tax set-aside estimate, and drafts invoices and reminders. Nothing goes to a client until you approve it.

> Built for the PayPal AI Hackathon 2026. Runs against the **PayPal sandbox only**; no real money moves.

**Status (25 Oct 2026):** PayPal plumbing (credential check, verified webhooks, test order) and the first AI step: drafting an invoice from a sentence. The ledger, approval screen and sending through PayPal Invoicing come next.

## Run it

Needs Node 22 or newer and a free PayPal developer account.

1. **Sandbox app.** Sign in at [developer.paypal.com](https://developer.paypal.com) → Apps & Credentials → **Sandbox** tab → Create App (Merchant). The sandbox already has a business account (the seller) and a personal account (the buyer); find the buyer's login under Testing Tools → Sandbox Accounts.
2. **Configure.**
   ```sh
   npm install
   cp .env.example .env   # paste the sandbox client ID and secret
   npm run check          # OK: sandbox token valid until ...
   ```
3. **Receive webhooks.** PayPal needs a public HTTPS URL. Start the app and a tunnel (for example `tailscale funnel 3000` or `ngrok http 3000`), then register it:
   ```sh
   npm start
   npm run webhook:register -- https://<your-public-url>
   ```
   Restart `npm start` so it picks up `PAYPAL_WEBHOOK_ID`. Re-running the command with the same URL reuses the existing webhook. To undo it, run `npm run webhook:remove`, which deletes the webhook at PayPal and clears the ID in `.env`.
4. **Make a test payment.** `npm run order:create` prints a PayPal link. Approve it as the sandbox **personal** account; you're sent back to `/return`, which captures the order. Open `/events`: `PAYMENT.CAPTURE.COMPLETED` should be listed with `"verified": true`.

Events from the dashboard's Webhooks Simulator are mock events. They fail signature verification, so they're logged with `"verified": false` and never reach the ledger.

## Model

The AI runs on [OpenRouter](https://openrouter.ai)'s free tier, so it runs on OpenRouter's providers, not on your machine. The default is `nvidia/nemotron-3-super-120b-a12b:free`, which supports tool calling and structured output. To use another model, change `MODEL` in `.env`.

1. Create a free key at openrouter.ai and put it in `.env` as `OPENROUTER_API_KEY`.
2. `npm run check:model` shows the key's limits and confirms the model is free and supports tools.
3. `npm run draft -- "invoice Northside Café £120 for Saturday's shoot, due in 14 days"` prints a draft. **Nothing is sent**: drafts only go to PayPal after you approve them.

Free models have daily limits, and the app adds its own cap (`MODEL_DAILY_LIMIT`, default 40 calls a day). Free endpoints may log prompts, so use only made-up data.

## Development

```sh
npm test                  # offline tests; PayPal is faked
scripts/install-hooks.sh  # pre-commit: gitleaks secret scan + tests
```

## Licence

Apache 2.0. See [LICENSE](LICENSE).
