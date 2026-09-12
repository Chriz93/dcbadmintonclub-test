#!/usr/bin/env python3
"""Writes legacy/migrations/PROD_DRYRUN.sql: PROD_2026-27.sql run as ONE transaction that can never commit.

Every standalone begin;/commit; is removed, the whole file is wrapped in a single transaction, and the last statement
runs verify.sql and then always raises an error that reports the result. Nothing is ever committed, so running the dry
run on production changes nothing; it only shows whether the real update would succeed on production's real data.
    python3 legacy/scripts/build-prod-dryrun.py"""
import hashlib, pathlib, re
root = pathlib.Path(__file__).resolve().parents[2]
src = (root / "legacy/migrations/PROD_2026-27.sql").read_text()
lines = src.split("\n"); kept = [l for l in lines if l.strip() not in ("begin;", "commit;")]
body = "\n".join(kept)
assert not re.search(r"(?im)^\s*(commit|rollback|end\s+transaction|commit\s+work)\s*;", body), "transaction control left in the body"
verify = (root / "legacy/migrations/verify.sql").read_text().split("\n", 1)[1].strip().rstrip(";")
dry = ("-- DRY RUN of PROD_2026-27.sql on the production database. Everything runs inside ONE transaction and the last\n"
       "-- statement always raises an error, so nothing is ever committed: production is left exactly as it was.\n"
       "begin;\n" + body + "\n"
       "do $dry$ declare ok int; total int; bad text; begin\n"
       f" select count(*) filter (where result='OK'), count(*), string_agg(check_name||': '||result, '; ') filter (where result<>'OK') into ok, total, bad from ({verify}) v;\n"
       " raise exception 'DRY RUN COMPLETE (rolled back, nothing changed): % of % checks OK. Not OK: %', ok, total, coalesce(bad,'none');\n"
       "end $dry$;\n")
assert not re.search(r"(?i)\bcommit\b", dry.replace("committed", "")), "commit found"
out = root / "legacy/migrations/PROD_DRYRUN.sql"; out.write_text(dry)
print(f"wrote {out.relative_to(root)}: removed {len(lines) - len(kept)} begin/commit lines; {len(dry.encode())} bytes; sha {hashlib.sha256(dry.encode()).hexdigest()[:16]}")
