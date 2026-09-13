// The coverage matrix (docs/29) has no gaps: every page, tab, control, form field, rule sentence, download, database
// function and table in the site is named by at least one test. Runs the inventory in --check mode (it writes nothing).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);

test("coverage · every page, tab, control, field, rule, download, database function and table is named by a test", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "legacy/tests/coverage-inventory.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no gaps/);
});
