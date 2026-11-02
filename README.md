# Gig Money

[![CI](https://github.com/J-sterling/gig-money/actions/workflows/ci.yml/badge.svg)](https://github.com/J-sterling/gig-money/actions/workflows/ci.yml)

A PayPal money assistant for gig workers. Payments arrive from PayPal by webhook and go into a ledger. The AI tags where each one came from, keeps a tax set-aside estimate, and drafts invoices and reminders. Nothing goes to a client until you approve it.

> Built for the PayPal AI Hackathon 2026. Runs against the **PayPal sandbox only**; no real money moves.

**Status (2 Nov 2026):** a working web app at `/`: a ledger with a separate demo workspace per visitor, "Get paid" through PayPal Orders, AI invoice drafts, and an approval gate. Approved drafts go out through PayPal Invoicing, and paying the invoice adds the income to the ledger. New payments are tagged by source by the AI, using your own past payments as examples (keyword rules take over if the model is unavailable), and sent invoices can get an AI-drafted reminder that also waits for approval. The hosted demo is live on Render behind a password, with rate limits and a daily health check, and payment tagging runs as a Render Workflow whose steps show in the Render dashboard.

## For judges

**Hosted demo:** the URL and password are in the Devpost testing instructions (any username works). Everything runs in the PayPal **sandbox**: no real money moves.

1. You get your own demo workspace with a month of example income. Other visitors never see it.
2. **Get paid:** approve the sandbox payment on PayPal with the sandbox buyer login from the testing instructions. It lands in your ledger, and the AI tags where it came from.
3. **Ask for an invoice** in a sentence, for example "invoice Northside Café £120 for Saturday's shoot, due in 14 days". The AI drafts it.
4. **Approve and send:** only now does PayPal Invoicing create and send it. You get a pay link.
5. Open the **pay link**, pay as the sandbox buyer, then **Check payment**: it's marked paid and added to the ledger.
6. **Draft reminder** on a sent invoice, then approve it. **Reset my demo** starts you over.

Known limits: the tax figure is an estimate, not tax advice. The AI runs on a free model: if it's slow (over 20 s) or out of daily calls, you'll see a clearly labelled saved example instead, which you can still approve.

## Run it

Needs Node 22.13 or newer (for the built-in SQLite) and a free PayPal developer account. Data is kept in `var/gig-money.db`.

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
4. **Make a test payment.** `npm run order:create` prints a PayPal link. Approve it as the sandbox **personal** account; you're sent back to `/return`, which captures the order. Open `/events`: `PAYMENT.CAPTURE.COMPLETED` should be listed with `"verified": true`. (`/events` shows every visitor's events, so it's only served when `DEMO_PASSWORD` isn't set.)

**No tunnel? The ledger still works.** When you approve a payment, `/return` records it from PayPal's own capture reply. Webhooks only add the verified event, so they're optional when running locally.

Events from the dashboard's Webhooks Simulator are mock events. They fail signature verification, so they're logged with `"verified": false` and never reach the ledger.

## Using the app

`npm start`, then open `http://localhost:3000` (or your `PORT`).

1. **Get paid:** approve the sandbox payment as the sandbox buyer. It lands in your ledger.
2. **Ask for an invoice** in a sentence. The AI drafts it; if the free model is slow or out of calls, a clearly labelled saved example appears instead.
3. **Approve and send** (edit first if you like). Only then does the server create and send the invoice through PayPal Invoicing. You get a pay link instead of an email to the client.
4. Open the **pay link**, pay as the sandbox buyer, then **Check payment**: it's marked paid and the income is added to the ledger.
5. **Draft reminder** on a sent invoice: the AI writes a polite reminder for you to approve. If the invoice has a client email, approving logs it with PayPal (copied to you, not the client); either way you can copy the message and pay link.

Each new payment's **Source** is tagged in the background. An **AI** badge shows the model chose it (hover for its reason); **rule** means the keyword fallback did.

**Reset my demo** puts your workspace back to the starting month of example income.

## Model

The AI runs on [OpenRouter](https://openrouter.ai)'s free tier, so it runs on OpenRouter's providers, not on your machine. The default is `nvidia/nemotron-3.5-super-vl:free`, with `google/gemma-4-31b-it:free` as a fallback: OpenRouter tries the next one in the same request if a free endpoint is down. Both support tool calling and structured output. To change them, edit `MODEL` (a comma-separated list) in `.env`.

1. Create a free key at openrouter.ai and put it in `.env` as `OPENROUTER_API_KEY`.
2. `npm run check:model` shows the key's limits and confirms the model is free and supports tools.
3. `npm run draft -- "invoice Northside Café £120 for Saturday's shoot, due in 14 days"` prints a draft. **Nothing is sent**: drafts only go to PayPal after you approve them.

Free models have daily limits, and the app adds its own cap (`MODEL_DAILY_LIMIT`, default 40 calls a day). Free endpoints also queue: on 25 Oct one draft took 1.4 s and another 60 s. The app gives up after `MODEL_TIMEOUT_MS` (20 s) and reasoning is off (`MODEL_REASONING=none`), which is enough for drafting. Free endpoints may log prompts, so use only made-up data.

## How we use Render

The hosted demo is two Render services from one Blueprint (`render.yaml`):

- **Web service** (Starter, Frankfurt): the Express app, with a 1 GB disk at `/var/data` for the SQLite ledger, event log and daily model-call count. `/health` is Render's health check; every other page needs the demo password except the PayPal webhook, which only trusts events PayPal's signature check confirms.
- **Render Workflow** `gig-money-workflows` (`src/tasks/tag-payment.js`): tags where each new payment came from. A run of `tagPayment` calls a `classifyWithModel` step, and a `classifyWithRules` step only if the model fails, so every tag's path is visible in the Render dashboard. The ledger row shows the run id (`· Render run trn-…`).

Why a Workflow: it keeps the model call off the web service and makes each tag's steps visible and auditable. It is not faster (tagging already runs after PayPal gets its reply) and the ledger stays on the web service. The web service counts each run against the daily model cap before starting it, sends only the payment's payer, note and amount, and falls back to keyword rules if a run fails or takes over 60 s. The workflow has no disk and no PayPal or Render secrets. Payer names and notes from the sandbox appear in run inputs in the dashboard.

Without `RENDER_TAG_TASK` and `RENDER_WORKFLOW_API_KEY` set (as when you run it locally), tagging runs in-process exactly the same way.

## Deploy (Render)

`render.yaml` is a Render Blueprint: **New → Blueprint**, pick this repo, and either type the secrets when asked or leave them blank and copy them from an Ansible vault with `ansible-playbook ansible/render-env.yml --ask-vault-pass` (`-e dry_run=true` lists what it would set). They're marked `sync: false`, so none are in the repo. The playbook also puts the model key in env group `gig-money-model`, which the workflow reads (Render's API can't change a workflow's own env vars), and deploys a new workflow version. Then:

1. `npm run webhook:register -- https://<your-service>.onrender.com`, put the ID in Render as `PAYPAL_WEBHOOK_ID` (or in the vault as `paypal_webhook_id`, then run the playbook with `-e only=PAYPAL_WEBHOOK_ID`), and redeploy.
2. For workflow tagging, create a dedicated Render API key, put it in the vault as `render_workflow_api_key` and run the playbook. Render keys can't yet be scoped to one service, so keep nothing else in that Render account and revoke the key when the demo ends.
3. `scripts/render.sh suspend|resume|status|deploy` stops and starts the web service (needs `RENDER_API_KEY`). A suspended service isn't billed for compute, and its disk keeps the data.
4. `.github/workflows/health.yml` checks the demo daily until 15 Dec: `/health`, the password, the last tag (it fails if the model or workflow stopped answering) and one real draft. It needs repo variable `DEMO_URL` and repo secret `DEMO_PASSWORD`.

To try the tasks locally: `render workflows dev -- node src/tasks/tag-payment.js` (Render CLI 2.12+), then `render workflows tasks list --local`.

## Development

```sh
npm test                  # offline tests; PayPal is faked
scripts/install-hooks.sh  # pre-commit: gitleaks secret scan + tests
```

## Licence

Apache 2.0. See [LICENSE](LICENSE).
