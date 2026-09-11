#!/bin/sh
# Copies the newest league backup from GitHub to this Mac. No Supabase key here and no load on Supabase: the daily
# GitHub job (legacy-backup.yml) makes the backup; this only downloads it. Keeps the newest 120 days.
# Run by hand or daily by launchd (install-local-backups.sh). Log: ~/MaplewoodBackups/pull.log
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="Chriz93/dcbadmintonclub-test"
DEST="$HOME/MaplewoodBackups"
mkdir -p "$DEST"
exec >>"$DEST/pull.log" 2>&1
echo "── $(date '+%Y-%m-%d %H:%M') pulling newest backup"
RUN=$(gh run list -R "$REPO" --workflow=legacy-backup.yml --status success -L 1 --json databaseId,createdAt --jq '.[0] | "\(.databaseId) \(.createdAt)"')
[ -n "$RUN" ] || { echo "no successful backup run found"; exit 1; }
ID=${RUN%% *}; DAY=$(echo "${RUN#* }" | cut -c1-10)
OUT="$DEST/$DAY"
if [ -d "$OUT" ] && ls "$OUT"/*.json >/dev/null 2>&1; then echo "already have $DAY"; exit 0; fi
mkdir -p "$OUT"
gh run download "$ID" -R "$REPO" -D "$OUT.tmp"
find "$OUT.tmp" -name '*.json' -exec mv {} "$OUT/" \;
rm -rf "$OUT.tmp"
N=$(ls "$OUT"/*.json | wc -l | tr -d ' ')
for f in "$OUT"/*.json; do python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$f" || { echo "BROKEN $f"; exit 1; }; done
echo "saved $N tables to $OUT ($(du -sh "$OUT" | cut -f1)); every file is valid JSON"
ls -1d "$DEST"/20??-??-?? | sort | head -n -120 2>/dev/null | while read old; do rm -rf "$old"; echo "removed old $old"; done || true
