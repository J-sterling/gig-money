// Gig Money front end. All data shown is set with textContent, never innerHTML.
const $ = (id) => document.getElementById(id);
const gbp = (pence) => (pence / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
const money = (amount, currency) => Number(amount).toLocaleString("en-GB", { style: "currency", currency });
const day = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

async function api(path, init = {}) {
  const res = await fetch("/api" + path, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Something went wrong (HTTP ${res.status}).`);
  return body;
}

function notice(text, warn = false) {
  const n = $("notice");
  n.textContent = text; n.classList.toggle("warn", warn); n.hidden = !text;
}

let lastTop = null;
async function loadLedger() {
  const { payments, summary } = await api("/ledger");
  $("earned").textContent = gbp(summary.earned_pence);
  $("setaside").textContent = gbp(summary.set_aside_pence);
  $("setaside-note").textContent = `${Math.round(summary.set_aside_rate * 100)}% kept back. ${summary.note}`;
  $("safe").textContent = gbp(summary.safe_to_spend_pence);
  const body = $("ledger").tBodies[0];
  body.replaceChildren(...payments.map((p) => {
    const via = p.recorded_via === "seed" ? "example" : p.recorded_via === "invoice" ? "paid invoice" : "PayPal sandbox";
    const tr = el("tr", {},
      el("td", { className: "date", textContent: day(p.captured_at) }),
      el("td", {}, el("div", { textContent: p.payer || "PayPal payer" }), el("div", { className: "src", textContent: p.note || "" })),
      sourceCell(p, via),
      el("td", { className: "r", textContent: money(p.amount_pence / 100, p.currency) }));
    if (lastTop && p.id !== lastTop && p.recorded_via !== "seed" && p === payments[0]) tr.className = "new";
    return tr;
  }));
  lastTop = payments[0]?.id ?? null;
}

function sourceCell(p, via) {
  const top = el("div");
  if (!p.source) top.append(el("span", { className: "pending", textContent: "Tagging…" }));
  else {
    top.append(p.source);
    if (p.source_by === "rule") top.append(el("span", { className: "tagby rule", textContent: "rule", title: p.source_reason || "" }));
    else if (p.source_by && !["seed", "invoice"].includes(p.source_by)) top.append(el("span", { className: "tagby ai", textContent: "AI", title: `${p.source_by}: ${p.source_reason || ""}` }));
  }
  const cell = el("td", {}, top, el("div", { className: "src", textContent: via }));
  if (p.source_reason && p.source_by !== "seed") cell.append(el("div", { className: "src", textContent: p.source_reason }));
  return cell;
}

function draftCard(inv) {
  const d = inv.draft;
  const field = (name, label, value, type = "text", wide = false) => {
    const input = el("input", { name, type, value: value ?? "" });
    if (type === "number") { input.min = "0.01"; input.step = "0.01"; }
    if (name === "client_email") input.placeholder = "none: you'll get a pay link to share";
    return el("label", { className: wide ? "wide" : "" }, label, input);
  };
  const err = el("p", { className: "err", hidden: true });
  const approve = el("button", { type: "submit", textContent: "Approve and send" });
  const reject = el("button", { type: "button", className: "danger", textContent: "Reject" });
  const form = el("form", { className: "draft" },
    el("div", { className: "head" }, el("span", { textContent: "Draft · waiting for you" }), el("span", { textContent: `by ${inv.drafted_by}` })),
    el("p", { className: "reason", textContent: inv.reason || "" }),
    el("div", { className: "fields" },
      field("client_name", "Client", d.client_name, "text", true),
      field("client_email", "Client email", d.client_email, "email", true),
      field("amount", `Amount (${d.currency})`, d.amount, "number"),
      field("due_date", "Due", d.due_date, "date"),
      field("description", "Line item", d.description, "text", true)),
    err, el("div", { className: "actions" }, approve, reject));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const edits = { client_name: f.get("client_name"), client_email: f.get("client_email") || null, amount: Number(f.get("amount")),
      description: f.get("description"), due_date: f.get("due_date") };
    approve.disabled = reject.disabled = true; approve.textContent = "Sending through PayPal…"; err.hidden = true;
    try {
      await api(`/drafts/${inv.id}/approve`, { method: "POST", body: JSON.stringify({ edits }) });
      notice(`Sent through PayPal Invoicing. Open its pay link and pay as the sandbox buyer to see it marked paid.`);
    } catch (x) { err.textContent = x.message; err.hidden = false; }
    await loadInvoices();
  });
  reject.addEventListener("click", async () => {
    approve.disabled = reject.disabled = true;
    try { await api(`/drafts/${inv.id}/reject`, { method: "POST", body: "{}" }); notice("Rejected. Nothing was sent."); }
    catch (x) { err.textContent = x.message; err.hidden = false; }
    await loadInvoices();
  });
  return form;
}

function invoiceRow(inv) {
  const d = inv.draft;
  const meta = el("div", { className: "meta" }, el("span", { className: `pill ${inv.status}`, textContent: inv.status }), el("span", { textContent: `due ${day(d.due_date)}` }));
  if (inv.pay_url && inv.status === "sent") meta.append(el("a", { href: inv.pay_url, target: "_blank", rel: "noopener", textContent: "Pay link" }));
  if (inv.status === "sent") {
    const check = el("button", { type: "button", className: "ghost", textContent: "Check payment" });
    check.addEventListener("click", async () => {
      check.disabled = true;
      try {
        const r = await api(`/invoices/${inv.id}/refresh`, { method: "POST", body: "{}" });
        notice(r.status === "paid" ? "Paid. It's in your ledger." : "Not paid yet.", r.status !== "paid");
      } catch (x) { notice(x.message, true); }
      await Promise.all([loadInvoices(), loadLedger()]);
    });
    meta.append(check);
  }
  if (inv.status === "failed") meta.append(el("span", { textContent: inv.error || "Sending failed." }));
  const overdue = inv.status === "sent" && d.due_date < new Date().toISOString().slice(0, 10);
  if (overdue) meta.append(el("span", { className: "pill failed", textContent: "overdue" }));
  if (inv.reminder_status === "sent") meta.append(el("span", { textContent: `reminder ${inv.reminder?.via === "paypal" ? "logged with PayPal" : "approved"} ${day(inv.reminded_at)}` }));
  if (inv.status === "sent" && inv.reminder_status !== "draft") {
    const remind = el("button", { type: "button", className: "ghost", textContent: "Draft reminder" });
    remind.addEventListener("click", async () => {
      remind.disabled = true; remind.textContent = "Drafting…";
      try { await api(`/invoices/${inv.id}/reminder`, { method: "POST", body: "{}" }); } catch (x) { notice(x.message, true); }
      await loadInvoices();
    });
    meta.append(remind);
  }
  const row = el("div", { className: "inv" },
    el("div", {}, el("div", { className: "who", textContent: d.client_name }), el("div", { className: "src", textContent: d.description })),
    el("div", { className: "r", textContent: money(d.amount, d.currency) }), meta);
  if (inv.reminder_status === "draft") row.append(reminderCard(inv));
  return row;
}

// A reminder waits for approval like an invoice draft. Approving logs it with
// PayPal (copied to you, not the client); you send the text and pay link yourself.
function reminderCard(inv) {
  const r = inv.reminder;
  const subject = el("input", { name: "subject", value: r.subject, maxLength: 120 });
  const note = el("textarea", { name: "note", rows: 4, maxLength: 600, value: r.note });
  const err = el("p", { className: "err", hidden: true });
  const approve = el("button", { type: "submit", textContent: inv.draft.client_email ? "Approve and log with PayPal" : "Approve" });
  const copy = el("button", { type: "button", className: "ghost", textContent: "Copy text and pay link" });
  const reject = el("button", { type: "button", className: "danger", textContent: "Reject" });
  const form = el("form", { className: "draft reminder" },
    el("div", { className: "head" }, el("span", { textContent: "Reminder · waiting for you" }), el("span", { textContent: `by ${r.drafted_by}` })),
    el("label", {}, "Subject", subject), el("label", {}, "Message", note), err,
    el("div", { className: "actions" }, approve, copy, reject));
  copy.addEventListener("click", async () => {
    const text = `${note.value}\n\n${inv.pay_url ?? ""}`;
    try { await navigator.clipboard.writeText(text); copy.textContent = "Copied"; }
    catch { note.select(); copy.textContent = "Select and copy the message"; }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    approve.disabled = reject.disabled = true; err.hidden = true;
    try {
      const out = await api(`/invoices/${inv.id}/reminder/approve`, { method: "POST", body: JSON.stringify({ edits: { subject: subject.value, note: note.value } }) });
      notice(out.reminder?.via === "paypal"
        ? "Reminder logged with PayPal. Send the copied message and pay link to your client too."
        : "Reminder approved. This invoice has no client email, so PayPal can't log it: copy the message and pay link and send them yourself.");
    } catch (x) { err.textContent = x.message; err.hidden = false; }
    await loadInvoices();
  });
  reject.addEventListener("click", async () => {
    approve.disabled = reject.disabled = true;
    try { await api(`/invoices/${inv.id}/reminder/reject`, { method: "POST", body: "{}" }); } catch (x) { notice(x.message, true); }
    await loadInvoices();
  });
  return form;
}

async function loadInvoices() {
  const list = await api("/invoices");
  $("drafts").replaceChildren(...list.filter((i) => i.status === "draft" || i.status === "failed").map(draftCard));
  const done = list.filter((i) => i.status !== "draft");
  $("invoices").replaceChildren(...(done.length ? done.map(invoiceRow) : [el("p", { className: "muted", textContent: "No invoices yet." })]));
}

$("getpaid").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true;
  try {
    const { approve_url } = await api("/get-paid", { method: "POST", body: JSON.stringify({ amount: Number($("amount").value), note: $("note").value }) });
    location.href = approve_url; // PayPal sends the buyer back here when done
  } catch (x) { notice(x.message, true); btn.disabled = false; }
});

$("ask").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("ask-btn"); btn.disabled = true; btn.textContent = "Drafting… (up to 20 s on the free model)";
  try {
    await api("/drafts", { method: "POST", body: JSON.stringify({ request: $("request").value }) });
    notice("");
  } catch (x) { notice(x.message, true); }
  btn.disabled = false; btn.textContent = "Draft it";
  await loadInvoices();
});

// Reset wipes this workspace's payments and invoices, so it needs a second click.
let resetArmed = null;
$("reset").addEventListener("click", async () => {
  const btn = $("reset");
  if (!resetArmed) {
    btn.textContent = "Click again to wipe your payments and invoices";
    btn.classList.add("danger");
    resetArmed = setTimeout(() => { resetArmed = null; btn.textContent = "Reset my demo"; btn.classList.remove("danger"); }, 5000);
    return;
  }
  clearTimeout(resetArmed); resetArmed = null;
  btn.textContent = "Reset my demo"; btn.classList.remove("danger");
  await api("/reset", { method: "POST", body: "{}" });
  notice("Your demo is back to the starting month of example income.");
  lastTop = null;
  await Promise.all([loadLedger(), loadInvoices()]);
});

const q = new URLSearchParams(location.search);
if (q.get("paid") === "1") {
  notice("Payment received from PayPal and added to your ledger. The AI is tagging where it came from…");
  for (const ms of [3000, 8000, 20000]) setTimeout(loadLedger, ms); // tagging finishes in the background
}
if (q.get("paid") === "0") notice("PayPal returned, but no new payment was recorded (it may already be in your ledger).", true);
if (q.get("cancelled")) notice("Payment cancelled on PayPal. Nothing was charged.", true);
if (q.size) history.replaceState(null, "", "/");

Promise.all([loadLedger(), loadInvoices()]).catch((x) => notice(x.message, true));
window.addEventListener("focus", () => { loadLedger(); loadInvoices(); });
