#!/usr/bin/env python3
"""Builds the production copy of the site from the test copy.

    python3 legacy/scripts/build-production.py --key <production publishable key> --out ../dcbadmintonclub

Rewrites only: Supabase URL and key, page title, service-worker scope and cache name, manifest start_url.
Everything else is byte-identical to the tested index.html. Prints a diff summary; never prints the key."""
import argparse, getpass, hashlib, pathlib, re, subprocess, sys
PROD_URL = "https://bwepvxelvwgwxrnaglrx.supabase.co"
ap = argparse.ArgumentParser(); ap.add_argument("--key"); ap.add_argument("--out", required=True); ap.add_argument("--cache", default="dcbc-v40")
ap.add_argument("--reuse-key", action="store_true", help="take the publishable key from the production site already in --out")
a = ap.parse_args()
# Production gets exactly the tested artifact: only a committed index.html/sw.js/manifest.json is ever built.
_root = pathlib.Path(__file__).resolve().parents[2]
_dirty = subprocess.run(["git", "-C", str(_root), "status", "--porcelain", "--", "index.html", "sw.js", "manifest.json"], capture_output=True, text=True).stdout.strip()
if _dirty: sys.exit("Not built: index.html, sw.js or manifest.json has uncommitted changes. Build only from the committed, tested version.")
_commit = subprocess.run(["git", "-C", str(_root), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
# Without --key the script asks for it (hidden), the same in zsh and bash, and keeps it out of the shell history.
# --reuse-key takes it from the production build already published (the publishable key is public by design).
if a.key is None and a.reuse_key:
    prev = pathlib.Path(a.out).resolve() / "index.html"
    m = re.search(r"const SK='(sb_publishable_[A-Za-z0-9_-]+)'", prev.read_text()) if prev.exists() else None
    test_key = re.search(r"const SK='([^']*)'", (pathlib.Path(__file__).resolve().parents[2] / "index.html").read_text())
    if not m or (test_key and m.group(1) == test_key.group(1)) or "bwepvxelvwgwxrnaglrx" not in prev.read_text():
        sys.exit("Not built: no production key found in the existing production site; run without --reuse-key and paste it.")
    a.key = m.group(1)
raw = a.key if a.key is not None else getpass.getpass("Production publishable key (starts sb_publishable_; nothing shows while you paste, then press Enter): ")
# Clean what a paste can bring along: spaces, line breaks, quotes and the terminal's paste markers.
key = re.sub(r"\x1b\[20[01]~", "", raw).strip().strip("'\"").strip()
if not re.fullmatch(r"(sb_publishable_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_.-]{40,})", key):
    why = ("nothing was pasted" if not key else
           "that is the SECRET key (it starts sb_secret_); paste the publishable key instead" if key.startswith("sb_secret_") else
           "it does not start with sb_publishable_" if not key.startswith(("sb_publishable_", "eyJ")) else
           f"it contains {len(re.findall(r'[^A-Za-z0-9_.-]', key))} unexpected character(s), such as a space inside it" if re.search(r"[^A-Za-z0-9_.-]", key) else
           f"it is too short ({len(key)} characters)")
    sys.exit(f"Not built: {why}. Copy it again from Supabase → Settings → API keys → Publishable key (use its copy button). Nothing was changed.")
a.key = key   # never printed
root = pathlib.Path(__file__).resolve().parents[2]; out = pathlib.Path(a.out).resolve(); out.mkdir(parents=True, exist_ok=True)
def sub(s, old, new, must=1):
    n = s.count(old); assert n == must, f"expected {must} of {old[:50]!r}, found {n}"; return s.replace(old, new)
html = (root / "index.html").read_text()
html = sub(html, "const SB='https://wgolevihkvmosajumzvl.supabase.co'; // TEST project only", f"const SB='{PROD_URL}';")
html = re.sub(r"const SK='sb_publishable_[A-Za-z0-9_-]+'; // browser-safe publishable key", f"const SK='{a.key}'; // browser-safe publishable key", html, count=1)
assert a.key in html, "key line not found"
html = sub(html, "<title>🧪 Maplewood League — TEST</title>", "<title>Maplewood League</title>")
sw = (root / "sw.js").read_text()
sw = re.sub(r"const CACHE_NAME = 'dcbc-test-v\d+';", f"const CACHE_NAME = '{a.cache}';", sw, count=1)
sw = sw.replace("/dcbadmintonclub-test/", "/dcbadmintonclub/")
man = (root / "manifest.json").read_text().replace("/dcbadmintonclub-test/", "/dcbadmintonclub/")
(out / "index.html").write_text(html); (out / "sw.js").write_text(sw); (out / "manifest.json").write_text(man)
for extra in [".nojekyll"]:
    if (root / extra).exists(): (out / extra).write_text((root / extra).read_text())
assert "wgolevihkvmosajumzvl" not in html and "dcbadmintonclub-test" not in sw + man and "TEST</title>" not in html
src_sha = hashlib.sha256((root / "index.html").read_bytes()).hexdigest()
print(f"production build written to {out} (index.html {len(html)} bytes, cache {a.cache}) from TEST commit {_commit}, tested index.html sha256 {src_sha[:16]}")
