#!/bin/sh
# Checks that the live TEST site and the live production site are the same code. The only allowed differences are
# the four lines build-production.py rewrites: database address, publishable key, page title and cache name (plus the
# site path in sw.js and manifest.json). Prints IDENTICAL, or the lines that differ.
#   sh legacy/scripts/check-parity.sh
set -eu
T=$(mktemp -d)
norm() {  # $1 = site path, $2 = output folder
  mkdir -p "$2"
  for f in index.html sw.js manifest.json; do
    curl -fsS "https://chriz93.github.io/$1/$f?nocache=$(date +%s)" | sed -E \
      -e "s#const SB='https://[a-z]+\.supabase\.co';( // TEST project only)?#const SB=<database>;#" \
      -e "s#const SK='sb_publishable_[A-Za-z0-9_-]+';#const SK=<key>;#" \
      -e "s#<title>[^<]*</title>#<title>…</title>#" \
      -e "s#const CACHE_NAME = '[^']*';#const CACHE_NAME = <cache>;#" \
      -e "s#/dcbadmintonclub(-test)?/#/<site>/#g" > "$2/$f"
  done
}
norm dcbadmintonclub-test "$T/test"; norm dcbadmintonclub "$T/prod"
if diff -q "$T/test" "$T/prod" >/dev/null; then
  echo "IDENTICAL: TEST and production run the same code (only database, key, title and cache name differ)"
  status=0
else
  echo "DIFFERENT:"; diff "$T/test" "$T/prod" | head -40; status=1
fi
rm -rf "$T"; exit $status
