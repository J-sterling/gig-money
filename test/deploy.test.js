import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import express from "express";
import { passwordGate } from "../src/auth.js";
import { dataPath, loadConfig } from "../src/config.js";
import { rateLimit } from "../src/limits.js";

async function serve(app) {
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  return { base: `http://localhost:${server.address().port}`, close: () => server.close() };
}
const basic = (pw) => "Basic " + Buffer.from(`judge:${pw}`).toString("base64");

test("with a demo password, pages need it but /health and the PayPal webhook stay open", async () => {
  const app = express();
  app.use(passwordGate("s3cret-demo"));
  for (const p of ["/", "/api/ledger", "/health"]) app.get(p, (_q, r) => r.send("ok"));
  app.post("/webhooks/paypal", (_q, r) => r.send("ok"));
  const { base, close } = await serve(app);
  try {
    assert.equal((await fetch(`${base}/`)).status, 401);
    assert.match((await fetch(`${base}/`)).headers.get("www-authenticate"), /^Basic/);
    assert.equal((await fetch(`${base}/api/ledger`, { headers: { authorization: basic("wrong") } })).status, 401);
    assert.equal((await fetch(`${base}/api/ledger`, { headers: { authorization: basic("s3cret-demo") } })).status, 200);
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/webhooks/paypal`, { method: "POST" })).status, 200);
  } finally { close(); }
});

test("without a demo password, nothing is gated (local use)", async () => {
  const app = express();
  app.use(passwordGate(""));
  app.get("/", (_q, r) => r.send("ok"));
  const { base, close } = await serve(app);
  try { assert.equal((await fetch(`${base}/`)).status, 200); } finally { close(); }
});

test("the rate limit answers 429 after the per-minute allowance", async () => {
  let t = 0;
  const app = express();
  app.get("/x", rateLimit({ perMinute: 2, now: () => t }), (_q, r) => r.send("ok"));
  const { base, close } = await serve(app);
  try {
    assert.equal((await fetch(`${base}/x`)).status, 200);
    assert.equal((await fetch(`${base}/x`)).status, 200);
    assert.equal((await fetch(`${base}/x`)).status, 429);
    t = 61_000;
    assert.equal((await fetch(`${base}/x`)).status, 200);
  } finally { close(); }
});

test("DATA_DIR places the data files, and Render's URL is used as the public URL", () => {
  const c = loadConfig({ DATA_DIR: "/var/data", RENDER_EXTERNAL_URL: "https://gig-money.onrender.com/" });
  assert.equal(dataPath(c, "gig-money.db"), "/var/data/gig-money.db");
  assert.equal(c.publicUrl, "https://gig-money.onrender.com");
  assert.equal(dataPath(loadConfig({}), "events.jsonl"), "var/events.jsonl");
});

test("render.yaml keeps secrets out of the repo and the data on the disk", () => {
  const y = readFileSync(new URL("../render.yaml", import.meta.url), "utf8");
  for (const key of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "OPENROUTER_API_KEY", "DEMO_PASSWORD"]) {
    assert.match(y, new RegExp(`- key: ${key}\\n\\s+sync: false`), `${key} must be sync: false`);
  }
  assert.match(y, /- key: SESSION_SECRET\n\s+generateValue: true/);
  assert.match(y, /mountPath: \/var\/data/);
  assert.match(y, /- key: DATA_DIR\n\s+value: \/var\/data/);
  assert.match(y, /- key: PAYPAL_ENV\n\s+value: sandbox/);
});
