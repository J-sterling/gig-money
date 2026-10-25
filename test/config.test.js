import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig, requireCredentials, SANDBOX_BASE } from "../src/config.js";

test("defaults to the sandbox", () => {
  const c = loadConfig({});
  assert.equal(c.baseUrl, SANDBOX_BASE);
  assert.equal(c.publicUrl, "http://localhost:3000");
});

test("refuses to run against live PayPal", () => {
  assert.throws(() => loadConfig({ PAYPAL_ENV: "live" }), /sandbox only/);
});

test("needs both credentials", () => {
  assert.throws(() => requireCredentials(loadConfig({ PAYPAL_CLIENT_ID: "id" })), /PAYPAL_CLIENT_SECRET/);
  assert.doesNotThrow(() => requireCredentials(loadConfig({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "s" })));
});
