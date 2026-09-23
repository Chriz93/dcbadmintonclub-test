#!/usr/bin/env python3
"""Refuse to commit anything credential-shaped. Scans the STAGED diff only.
Self-tests every pattern first: a scanner that silently fails to compile is worse than no scanner."""
import re, subprocess, sys
PATTERNS = [
    ("supabase secret key", r"sb_secret_[A-Za-z0-9_-]{10,}", "x sb_secret_abcdefghijklmnop"),
    ("json web token",      r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}",
                            "k eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r"),
    ("named secret env",    r"(GMAIL_APP_PASSWORD|SMTP_PASS|SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY)\s*[:=]\s*[^\s$#{]",
                            "GMAIL_APP_PASSWORD=abcdefghijklmnop"),
    ("service role key",    r"(service_role|secret)[_\s]*(key|token)\s*[:=]\s*[A-Za-z0-9._-]{20,}",
                            "service_role_key = abcdefghijklmnopqrstuvwxyz123"),
    ("inline password",     r"password\s*[:=]\s*[\"']?[^\s$#{\"']{6,}", 'password: "hunter2xyz"'),
    ("gmail app password",  r"\b[a-z]{16}\b[^\n]{0,24}(app password|gmail)", "xyzabcdefghijklm nop gmail"),
]
bad = [n for n, p, probe in PATTERNS if not re.search(p, probe, re.I)]
if bad:
    print("SECRET SCAN BROKEN — these patterns did not catch their own example:", ", ".join(bad)); sys.exit(2)
ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
diff = subprocess.run(["git", "diff", "--cached", "-U0"], capture_output=True, text=True, cwd=ROOT).stdout
# This file carries deliberate examples of what a secret looks like, so it is not scanned for them.
SELF = "legacy/scripts/secret-scan.py"
added, skip = [], False
for l in diff.splitlines():
    if l.startswith("diff --git "):
        skip = SELF in l
    elif l.startswith("+") and not l.startswith("+++") and not skip:
        added.append(l[1:])
hits = [(n, l.strip()[:120]) for l in added for n, p, _ in PATTERNS if re.search(p, l, re.I)]
if hits:
    print("SECRET SCAN FAILED — staged changes contain something credential-shaped:")
    for n, l in hits[:10]: print(f"  [{n}] {l}")
    sys.exit(1)
print(f"secret scan: {len(PATTERNS)} patterns self-tested, no secrets in {len(added)} added lines")
