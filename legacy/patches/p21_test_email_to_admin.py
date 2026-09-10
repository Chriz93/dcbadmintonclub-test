#!/usr/bin/env python3
"""Phase 10b: the admin's test email goes to the admin's own address and carries a preview of the real reminder."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new):
    global s
    assert old in s, "anchor missing: " + old[:70]
    s = s.replace(old, new, 1)
rep("    await setKV('reminder_request',{kind,id:String(Date.now()),at:new Date().toISOString(),session:n,by:myEmail()});", "    await setKV('reminder_request',{kind,id:String(Date.now()),at:new Date().toISOString(),session:n,by:myEmail(),to:myEmail()});")
rep('        <button class="btn btn-ghost" onclick="requestReminderRun(\'smoke\')">📧 Send a test email to the league inbox</button>', '        <button class="btn btn-ghost" onclick="requestReminderRun(\'smoke\')">📧 Send a test email to me</button>')
rep("toast(kind==='smoke'?'Test email queued — sent within about 10 minutes'", "toast(kind==='smoke'?`Test email queued for ${myEmail()} — sent within about 10 minutes`")
p.write_text(s); print("patched")
