#!/usr/bin/env python3
"""Read legacy export locally; print only counts and schema gaps, never personal fields.
Does not discard unknown keys or perform a migration. Preserve original encrypted export.
"""
import json,sys,hashlib,pathlib
p=pathlib.Path(sys.argv[1]);data=json.loads(p.read_text())
if not isinstance(data,dict):sys.exit('Expected object export')
players=data.get('players',[]);seen=set();duplicates=[]
for player in players:
    i=player.get('id')
    if i is None or i in seen:duplicates.append(i)
    seen.add(i)
keys=list(data.get('kv',{}).keys())
known={'current_session','completed_sessions','player_approvals','membership_overrides','pre_session_attendance','round_snapshots','qa_questions','admin_pin','pin','invite_code'}
unknown=[k for k in keys if k not in known and not k.startswith(('votes_session_','rsvp_session_','snapshot_'))]
print(json.dumps({'sourceSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'playerCount':len(players),'announcementCount':len(data.get('announcements',[])),'kvCount':len(keys),'duplicateOrMissingIds':len(duplicates),'unmappedKeyCount':len(unknown),'requiresVerifiedAuthIdentityMapping':True,'migrationPerformed':False},indent=2))
if duplicates:sys.exit(1)
