# Security

Gig Money handles money, so it is built to be safe by default. It runs against the **PayPal sandbox only**: no real money moves and no live keys exist anywhere in this project.

## Reporting a problem
Open a GitHub issue without exploit details, or use GitHub's private vulnerability reporting on this repo.

## What we protect, and how

| Risk | Control | Where |
|---|---|---|
| Real money or live keys | The app refuses to start unless `PAYPAL_ENV=sandbox` | `src/config.js` |
| Forged PayPal events | Every webhook is checked with PayPal's verify-webhook-signature API; unverified or repeated events never touch the ledger | `src/app.js`, `src/paypal.js` |
| The AI sending something wrong to a client | A server-side approval gate: invoices and reminders are drafts until the worker approves; a draft can't be approved twice or after rejection; PayPal is asked not to email anyone | `src/invoices.js`, `src/paypal.js` |
| Prompt injection through payment notes | The model's answer is schema-checked and limited to the worker's own categories; it can't trigger any action | `src/tag-payment.js`, `src/draft-invoice.js` |
| Visitors seeing each other's data | Each visitor gets a signed workspace cookie; every query is scoped to it | `src/workspaces.js`, `src/ledger.js` |
| Floods and runaway AI costs | Per-IP rate limits and a daily model-call cap | `src/limits.js`, `src/model.js` |
| Browser attacks (XSS, clickjacking) | A strict Content-Security-Policy (only the app's own script and stylesheet), HSTS, nosniff, frame-ancestors none, cross-origin isolation; the front end only sets text, never HTML | `src/headers.js`, `public/app.js` |
| Secrets leaking | Secrets live in an Ansible vault and reach Render through a playbook; none are in the repo; gitleaks runs before every commit and in CI | `ansible/render-env.yml`, `.githooks/`, `.github/workflows/ci.yml` |
| Public demo access | Every page needs the demo password except `/health` and the signature-checked PayPal webhook | `src/auth.js` |

## Render Workflow
Payment tagging runs as a Render Workflow. The web service starts runs with a dedicated Render API key. Render keys can't yet be scoped to one service, so the account holds nothing but this demo, and the key is revoked after judging (16 Dec 2026). The workflow itself has no disk and no PayPal or Render secrets, and receives only a payment's text fields.

## Scanning
Adapted from my homelab security pipeline (SAST, SCA, DAST). Results appear in the repo's Security tab.

| Type | Tool | When |
|---|---|---|
| SAST | Semgrep (JavaScript, Node and secrets rules) | Every push and pull request |
| SCA and config | Trivy (dependencies, high and critical) | Every push and pull request |
| DAST | OWASP ZAP baseline, passive, against the live demo | Weekly, and by hand |
| Secrets | gitleaks | Every commit and in CI |
| Dependencies | Dependabot | Weekly |

Reviewed ZAP alerts and the reason each is accepted are in `.zap/rules.tsv`.
