import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setEnvVar } from "../src/envfile.js";

test("replaces one line and keeps the rest", () => {
  const p = join(mkdtempSync(join(tmpdir(), "gm-")), ".env");
  writeFileSync(p, "A=1\nPAYPAL_WEBHOOK_ID=old\nB=2\n");
  setEnvVar("PAYPAL_WEBHOOK_ID", "new", p);
  assert.equal(readFileSync(p, "utf8"), "A=1\nB=2\nPAYPAL_WEBHOOK_ID=new\n");
});
