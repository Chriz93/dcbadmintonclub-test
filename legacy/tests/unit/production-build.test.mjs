// The production build (legacy/scripts/build-production.py) turns the tested TEST page into the league site's page by
// changing only its settings: the database address and key, the title, the TEST banner and the content security policy;
// the service worker's cache prefix; the manifest's name and path. It copies the icons and the pinned PDF library.
// Built from a clean checkout of HEAD (a temporary git worktree) into a temporary folder with a made-up key; nothing is
// published and no network is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const PROD = "https://bwepvxelvwgwxrnaglrx.supabase.co";

test("production build · only the settings change; the league's name, database and caches; no TEST left", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prod-build-")), wt = path.join(tmp, "wt"), out = path.join(tmp, "out");
  execFileSync("git", ["-C", ROOT, "worktree", "add", "--detach", wt, "HEAD"], { stdio: "ignore" });
  try {
    const r = spawnSync("python3", [path.join(wt, "legacy/scripts/build-production.py"), "--key", "sb_publishable_UNITtestUNITtestUNITtest0", "--out", out, "--cache", "unit-v1"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const html = fs.readFileSync(path.join(out, "index.html"), "utf8"), sw = fs.readFileSync(path.join(out, "sw.js"), "utf8");
    const man = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")), tested = fs.readFileSync(path.join(wt, "index.html"), "utf8");
    assert.ok(!/wgolevihkvmosajumzvl/.test(html + sw + JSON.stringify(man)), "no TEST database address");
    assert.ok(!html.includes("TEST SITE") && !html.includes("— TEST</title>"), "no TEST banner or title");
    assert.ok(html.includes(`const SB='${PROD}';`), "the league database");
    assert.ok(html.includes(`connect-src 'self' ${PROD};`), "the security policy names the league database");
    assert.ok(html.includes("const SK='sb_publishable_UNITtestUNITtestUNITtest0'"), "the given publishable key");
    assert.match(sw, /const CACHE_PREFIX = 'dcbc-prod-';/, "the league site owns dcbc-prod- caches");
    assert.match(sw, /const CACHE_NAME = CACHE_PREFIX \+ 'unit-v1';/);
    assert.ok(!sw.includes("dcbc-test-") && !sw.includes("dcbadmintonclub-test"), "no TEST cache or path in the service worker");
    assert.deepEqual({ name: man.name, short: man.short_name, start: man.start_url }, { name: "Maplewood League", short: "Maplewood", start: "/dcbadmintonclub/" });
    assert.ok(!/TEST|Test/.test(JSON.stringify(man)), "the installed app is not named TEST");
    for (const f of ["icon-192.png", "icon-512.png", "vendor/jspdf-4.2.1.umd.min.js", "vendor/jspdf-LICENSE.txt"]) {
      assert.deepEqual(fs.readFileSync(path.join(out, f)), fs.readFileSync(path.join(wt, f)), `${f} copied byte for byte`);
    }
    // Everything else is the tested page: only the settings lines differ.
    const a = tested.split("\n"), b = html.split("\n");
    assert.equal(b.length, a.length, "same number of lines");
    const changed = a.map((line, i) => (line === b[i] ? null : line)).filter((x) => x !== null);
    for (const line of changed) assert.match(line, /const SB=|const SK=|<title>|environment-banner|connect-src/, `only settings lines change: ${line.slice(0, 90)}`);
    assert.ok(changed.length <= 6, `${changed.length} lines changed`);
  } finally {
    execFileSync("git", ["-C", ROOT, "worktree", "remove", "--force", wt], { stdio: "ignore" });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// check-parity.sh ignores exactly the lines the build rewrites: a fresh build compares IDENTICAL to the tested copy,
// and any other change (also inside a rewritten line) is still reported. Local folders only; no network.
test("parity check · a fresh production build is IDENTICAL; any other difference is DIFFERENT", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "parity-")), wt = path.join(tmp, "wt"), out = path.join(tmp, "out");
  execFileSync("git", ["-C", ROOT, "worktree", "add", "--detach", wt, "HEAD"], { stdio: "ignore" });
  try {
    const b = spawnSync("python3", [path.join(wt, "legacy/scripts/build-production.py"), "--key", "sb_publishable_UNITtestUNITtestUNITtest0", "--out", out, "--cache", "unit-v1"], { encoding: "utf8" });
    assert.equal(b.status, 0, b.stderr || b.stdout);
    const parity = (prod) => spawnSync("sh", [path.join(ROOT, "legacy/scripts/check-parity.sh"), wt, prod], { encoding: "utf8" });
    const ok = parity(out);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /^IDENTICAL/);
    const cases = [
      ["index.html", (s) => s.replace("<title>", "<title lang=\"en\">"), "title tag"],
      ["index.html", (s) => s.replace("connect-src 'self' https://bwepvxelvwgwxrnaglrx.supabase.co;", "connect-src 'self' https://bwepvxelvwgwxrnaglrx.supabase.co https://evil.example;"), "extra host in the security policy"],
      ["index.html", (s) => s.replace("connect-src 'self' https://bwepvxelvwgwxrnaglrx.supabase.co;", "connect-src 'self' https://otherproject.supabase.co;"), "another database in the security policy"],
      ["index.html", (s) => s.replace("const SITE_ENV=", "const SITE_ENV =" ), "a code line"],
      ["index.html", (s) => s.replace("/dcbadmintonclub/", "/dcbadmintonclub-test/"), "a site path in the page (not rewritten)"],
      ["sw.js", (s) => s.replace("'dcbc-prod-'", "'dcbc-other-'"), "cache prefix"],
      ["sw.js", (s) => s.replace("const BASE", "const  BASE"), "a service-worker line"],
      ["manifest.json", (s) => s.replace('"theme_color": "#146c2e"', '"theme_color": "#000000"'), "manifest colour"],
    ];
    for (const [file, edit, what] of cases) {
      const alt = path.join(tmp, "alt");
      fs.rmSync(alt, { recursive: true, force: true }); fs.cpSync(out, alt, { recursive: true });
      const before = fs.readFileSync(path.join(alt, file), "utf8"), after = edit(before);
      assert.notEqual(after, before, `the edit applies: ${what}`);
      fs.writeFileSync(path.join(alt, file), after);
      const r = parity(alt);
      assert.equal(r.status, 1, `${what} must be reported: ${r.stdout}`);
      assert.match(r.stdout, /^DIFFERENT/);
    }
  } finally {
    execFileSync("git", ["-C", ROOT, "worktree", "remove", "--force", wt], { stdio: "ignore" });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
