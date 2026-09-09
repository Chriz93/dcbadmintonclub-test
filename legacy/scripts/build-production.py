#!/usr/bin/env python3
"""Builds the production copy of the site from the test copy.

    python3 legacy/scripts/build-production.py --key <production publishable key> --out ../dcbadmintonclub

Rewrites only: Supabase URL and key, page title, service-worker scope and cache name, manifest start_url.
Everything else is byte-identical to the tested index.html. Prints a diff summary; never prints the key."""
import argparse, pathlib, re, sys
PROD_URL = "https://bwepvxelvwgwxrnaglrx.supabase.co"
ap = argparse.ArgumentParser(); ap.add_argument("--key", required=True); ap.add_argument("--out", required=True); ap.add_argument("--cache", default="dcbc-v40")
a = ap.parse_args()
if not re.fullmatch(r"(sb_publishable_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_.-]{40,})", a.key): sys.exit("--key must be the production publishable (or legacy anon) key")
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
print(f"production build written to {out} (index.html {len(html)} bytes, cache {a.cache})")
