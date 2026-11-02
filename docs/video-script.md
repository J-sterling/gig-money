# Demo video script: Gig Money (target 2:50, hard limit under 3:00)

Recorded from the live build at https://gig-money-7c79.onrender.com in the PayPal sandbox. Everything after the 5-second intro is a real screen recording; nothing is mocked. Narration is about 321 words, roughly 2:08 at 150 words a minute, which leaves pauses for clicks and results inside the 2:50 runtime.

## Shots and narration

| # | Time | On screen | Narration |
|---|---|---|---|
| 1 | 0:00-0:05 | AI-generated intro (open-higgsfield): a gig worker between jobs, a phone buzzing with payments. No logos, uniforms or real brands. | Sam has three gigs and one PayPal account. |
| 2 | 0:05-0:18 | Title card "Gig Money: a PayPal money assistant for gig workers" (2 s), then the app with its ledger and three figures. | Delivery payouts, print sales and photo jobs all land in it, and Sam can't tell what's safe to spend, what's owed in tax, or who still owes them. Gig Money fixes that. |
| 3 | 0:18-0:50 | **Get paid:** type "Framed print for a wedding gift", £35, click **Get paid**. Approve on PayPal as the sandbox buyer and land back in the ledger. Show the "Tagging…" row turning into **Craft shop**, hover the reason, then the three figures updating. | A client pays through PayPal. Orders captures the payment, and PayPal's webhook confirms it; we check its signature before anything touches the ledger. The AI tags where the money came from, using Sam's own past payments as examples, and says why. The tax set-aside and safe-to-spend figures update straight away, clearly labelled an estimate, not tax advice. |
| 4 | 0:50-1:35 | **Invoice:** in "Ask for an invoice", type "invoice Northside Café (cafe@example.com) £120 for Saturday's shoot, due in 14 days", click **Draft it**. Show the draft card "Draft · waiting for you" and its reason. Click **Approve and send**, then the **Pay link**. Pay as the sandbox buyer, come back, click **Check payment** and see "Paid. It's in your ledger." | Invoicing is where gig workers lose evenings. Sam types one sentence. The AI turns it into a structured draft with the client, amount and due date, and explains how it read the request. Then it stops. Nothing reaches a client or PayPal until Sam approves, and the server refuses to send anything that hasn't been approved. One click, and PayPal Invoicing creates and issues it, and hands back a pay link Sam shares. When the client pays, PayPal confirms it and the income joins the ledger. |
| 5 | 1:35-1:52 | **Reminder:** on a sent invoice, click **Draft reminder**, show "Reminder · waiting for you", approve it. | Late payers get a polite AI-drafted reminder, behind the same approval gate, and logged with PayPal Invoicing. Sam stays in control of every message. |
| 6 | 1:52-2:20 | **Under the hood:** the Render dashboard, Workflows → gig-money-workflows, the latest `tagPayment` run expanded to its `classifyWithModel` step (about 10 s). Then the ledger row's reason ending "· Render run trn-…". Then a quick pan over the architecture page. | Under the hood: every tag runs as a Render Workflow that chains a model task and a rules task, each with its own run step. Here's the run. If the model fails, the rules step takes over, so a payment is never left untagged. The ledger stores the run id. It's sandbox only, webhooks are signature-checked, and a daily health check fails if the AI stops answering. |
| 7 | 2:20-2:40 | Back to the ledger: the paid invoice and new payments, the three figures. | So Sam gets one honest number to spend, tax put aside before it's spent, and invoices that go out and get paid, without an evening of admin. |
| 8 | 2:40-2:52 | Closing card: demo URL · github.com/J-sterling/gig-money (Apache-2.0) · "PayPal Orders · Invoicing · Webhooks · a free OpenRouter model · Render Workflows". | Gig Money. Built on PayPal, with AI that drafts and a human who decides. Try it at the link below. |

## Before recording (8 Nov)
- [ ] OpenRouter key working: run `health.yml` with force (no model warning). The current key expires about 9 Nov.
- [ ] Focus mode on, so no notifications appear. Close other apps.
- [ ] Chrome: a clean profile, window 1920×1080, zoom about 125%, bookmarks bar hidden, one tab.
- [ ] Log in to the demo and to the PayPal sandbox **before** recording, so no password is typed on camera.
- [ ] Click **Reset my demo**, then do one practice run of each segment.
- [ ] Render dashboard open on the gig-money-workflows Workflow page, logged in. Crop or blur the account name and email in the corner.
- [ ] Re-record any take where the draft card says "saved example" or a tag's reason lacks "· Render run": the model or the Workflow didn't answer.
- [ ] Shot 4: wait about 5 s after paying before clicking **Check payment**, then trim the wait in the edit.
- [ ] Check that the AI video provider's terms allow public use of the intro clip.

## Recording (QuickTime)
- ⇧⌘5 → **Record Selected Portion** around the browser window. Use one clip per numbered shot, so loading screens and logins are never recorded.
- To narrate live: Options → Microphone. Otherwise record silent and add the voiceover in iMovie.
- Trim each clip in QuickTime (⌘T). Keep clicks deliberate and pause a beat on each result.

## Assembly (iMovie)
- New project: intro clip (5 s), title card, clips 3-7 in order, closing card.
- Add the voiceover (your voice, or an AI voice whose licence allows public use) and line each paragraph up with its shot.
- No music, or royalty-free only. No real brand names or logos anywhere.
- Export at 1080p. Check the length is under 3:00.

## Never on screen
The demo password, PayPal sandbox or developer passwords, Render or OpenRouter API keys, the `.env` file, the Render API key page, or your real email.

## Upload
- YouTube → **Public** (not Unlisted or Private). Title: "Gig Money: PayPal + AI money assistant for gig workers (PayPal AI Hackathon 2026)".
- Upload by **9 Nov**; processing can take hours. Open the link in a logged-out window to check it plays.
- Put the link in the Devpost submission and the README.
