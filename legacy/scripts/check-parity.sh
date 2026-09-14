#!/bin/sh
# Checks that the live TEST site and the live production site are the same code. The only allowed differences are
# the lines build-production.py rewrites, each only in the file it rewrites:
#   index.html     database address, publishable key, page title, the database in the security policy, the TEST banner
#   sw.js          cache prefix and cache name, site path
#   manifest.json  name, short name, description, site path
# Prints IDENTICAL, or the lines that differ.
#   sh legacy/scripts/check-parity.sh                          the live sites
#   sh legacy/scripts/check-parity.sh <test folder> <prod folder>   two local copies (used by the unit test)
set -eu
if [ $# -eq 2 ]; then TEST_SRC=$1; PROD_SRC=$2
else TEST_SRC=https://chriz93.github.io/dcbadmintonclub-test; PROD_SRC=https://chriz93.github.io/dcbadmintonclub; fi
T=$(mktemp -d)
get() {  # $1 = site address or folder, $2 = file
  case $1 in https://*) curl -fsS "$1/$2?nocache=$(date +%s)" ;; *) cat "$1/$2" ;; esac
}
norm() {  # $1 = site address or folder, $2 = output folder
  mkdir -p "$2"
  get "$1" index.html | sed -E \
    -e "s#const SB='https://[a-z]+\.supabase\.co';( // TEST project only)?#const SB=<database>;#" \
    -e "s#const SK='sb_publishable_[A-Za-z0-9_-]+';#const SK=<key>;#" \
    -e "s#<title>[^<]*</title>#<title>…</title>#" \
    -e "s#connect-src 'self' https://(wgolevihkvmosajumzvl|bwepvxelvwgwxrnaglrx)\.supabase\.co;#connect-src 'self' <database>;#" \
    -e "s#<div class=\"env-banner\" id=\"environment-banner\">TEST SITE[^<]*</div>##" > "$2/index.html"
  get "$1" sw.js | sed -E \
    -e "s#^const CACHE_PREFIX = 'dcbc-(test|prod)-';\$#const CACHE_PREFIX = <prefix>;#" \
    -e "s#^const CACHE_NAME = CACHE_PREFIX \+ '[^']+';\$#const CACHE_NAME = CACHE_PREFIX + <cache>;#" \
    -e "s#^const CACHE_NAME = '[^']*';\$#const CACHE_NAME = <cache>;#" \
    -e "s#/dcbadmintonclub(-test)?/#/<site>/#g" > "$2/sw.js"
  get "$1" manifest.json | sed -E \
    -e "s#^  \"(name|short_name|description)\": \"[^\"]*\",\$#  \"\1\": <league>,#" \
    -e "s#/dcbadmintonclub(-test)?/#/<site>/#g" > "$2/manifest.json"
}
norm "$TEST_SRC" "$T/test"; norm "$PROD_SRC" "$T/prod"
if diff -q "$T/test" "$T/prod" >/dev/null; then
  echo "IDENTICAL: TEST and production run the same code (only the settings build-production.py rewrites differ)"
  status=0
else
  echo "DIFFERENT:"; diff "$T/test" "$T/prod" | head -40; status=1
fi
rm -rf "$T"; exit $status
