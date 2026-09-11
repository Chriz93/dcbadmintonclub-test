#!/bin/sh
# One-time: copy the newest league backup to ~/MaplewoodBackups every day at 09:00 (or when the Mac next wakes).
set -eu
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.maplewood.pull-backups.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/MaplewoodBackups"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.maplewood.pull-backups</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>$REPO_DIR/legacy/scripts/pull-backups.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><true/>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed. Backups land in ~/MaplewoodBackups (log: ~/MaplewoodBackups/pull.log). To stop: launchctl unload $PLIST"
