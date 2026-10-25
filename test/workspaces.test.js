import assert from "node:assert/strict";
import { test } from "node:test";
import { newWorkspaceId, readCookie, sign, verify } from "../src/workspaces.js";

test("a signed workspace cookie verifies only with the same secret", () => {
  const id = newWorkspaceId();
  assert.equal(verify(sign(id, "s1"), "s1"), id);
  assert.equal(verify(sign(id, "s1"), "s2"), null);
});

test("tampered or malformed cookies are rejected", () => {
  const [, mac] = sign("ws_00000000000000aa", "s").split(".");
  assert.equal(verify(`ws_00000000000000bb.${mac}`, "s"), null);
  assert.equal(verify("garbage", "s"), null);
  assert.equal(verify(undefined, "s"), null);
});

test("reads one cookie from the header", () => {
  assert.equal(readCookie("a=1; gm_ws=ws_1.abc%3D; b=2"), "ws_1.abc=");
  assert.equal(readCookie(undefined), null);
});
