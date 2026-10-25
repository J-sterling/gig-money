# Gig Money

A PayPal money assistant for gig workers. Payments arrive from PayPal by webhook and go into a ledger. The AI tags where each one came from, keeps a tax set-aside estimate, and drafts invoices and reminders. Nothing goes to a client until you approve it.

> Built for the PayPal AI Hackathon 2026. Runs against the **PayPal sandbox only**; no real money moves.

**Status (24 Oct 2026):** PayPal plumbing only: credential check, webhook receiver with signature verification, and a test order. The ledger, AI tagging, tax estimate and invoices come next.

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
   Restart `npm start` so it picks up `PAYPAL_WEBHOOK_ID`.
4. **Make a test payment.** `npm run order:create` prints a PayPal link. Approve it as the sandbox **personal** account; you're sent back to `/return`, which captures the order. Open `/events`: `PAYMENT.CAPTURE.COMPLETED` should be listed with `"verified": true`.

Events from the dashboard's Webhooks Simulator are mock events. They fail signature verification, so they're logged with `"verified": false` and never reach the ledger.

## Development

```sh
npm test                  # offline tests; PayPal is faked
scripts/install-hooks.sh  # pre-commit: gitleaks secret scan + tests
```

## Licence

Apache 2.0. See [LICENSE](LICENSE).
