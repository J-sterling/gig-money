# Security

Gig Money handles money, so it is built to be safe by default. It runs against the **PayPal sandbox only**: no real money moves and no live keys exist anywhere in this project.

## Reporting a problem
Open a GitHub issue without exploit details, or use GitHub's private vulnerability reporting on this repo.

## What we protect, and how

| Risk | Control | Where |
|---|---|---|
| Real money or live keys | The app refuses to start unless `PAYPAL_ENV=sandbox` | `src/config.js` |
| Forged PayPal events | Every webhook is checked with PayPal's verify-webhook-signature API; unverified or repeated events never touch the ledger | `src/app.js`, `src/paypal.js` |
| The AI sending something wrong to a client | A server-side approval gate: invoices and reminders are drafts until the worker approves; a draft can't be approved twice or after rejection; PayPal never emails the client (a reminder emails the worker a copy) | `src/invoices.js`, `src/paypal.js` |
| Prompt injection (requests, payment notes, invoice text) | The model has no tools and can't act; user and payer text is fenced in `<request>`/`<payment>`/`<invoice>` tags and marked as data; every answer is schema-checked by the app itself (categories limited to the worker's own, amounts up to 10,000, length caps, no links); an email is kept only if the worker typed it; nothing is sent without approval | `src/draft-invoice.js`, `src/draft-reminder.js`, `src/tag-payment.js`, `test/injection.test.js` |
| Visitors seeing each other's data | Each visitor gets a signed workspace cookie; every query is scoped to it | `src/workspaces.js`, `src/ledger.js` |
| Floods and runaway AI costs | Per-IP rate limits and a daily model-call cap | `src/limits.js`, `src/model.js` |
| Browser attacks (XSS, clickjacking) | A strict Content-Security-Policy (only the app's own script and stylesheet), HSTS, nosniff, frame-ancestors none, cross-origin isolation; the front end only sets text, never HTML | `src/headers.js`, `public/app.js` |
| Secrets leaking | Secrets live in an Ansible vault and reach Render through a playbook; none are in the repo; gitleaks runs before every commit and in CI | `ansible/render-env.yml`, `.githooks/`, `.github/workflows/ci.yml` |
| Public demo access | Every page needs the demo password except `/health` and the signature-checked PayPal webhook | `src/auth.js` |

## AI risks (OWASP Top 10 for LLM Applications)

| Risk | How Gig Money handles it |
|---|---|
| LLM01 Prompt injection | See the table above. `test/injection.test.js` plays a fooled model and checks the guardrails still hold (no live model is attacked: OpenRouter's terms forbid red-teaming without approval) |
| LLM02 Insecure output handling | Model output is only ever shown with `textContent` under a strict CSP; it is never executed or used to build HTML or SQL |
| LLM04 Model denial of service | Per-IP rate limits, a 40-call daily cap, a 20 s timeout, and labelled fallbacks |
| LLM06 Sensitive information disclosure | Prompts carry no secrets and no other visitor's data; the tagging workflow gets only a payment's text fields. Free models may log prompts, so the demo uses made-up data only |
| LLM08 Excessive agency | No tools. Every invoice and reminder waits for the worker's approval, enforced on the server |
| LLM09 Overreliance | Tax figures are labelled an estimate; every draft and tag shows the model's reason |

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
