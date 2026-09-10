#!/usr/bin/env python3
"""Phase 10: the admin can trigger email from the app. The browser never holds a mail password, so the buttons queue
a request in app_state; the scheduled job (every 10 minutes) picks it up, sends, and writes back the result."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)

rep("""        <button class="btn btn-ghost" onclick="exportData()">📤 Export JSON Backup</button>
      </div>""",
"""        <button class="btn btn-ghost" onclick="exportData()">📤 Export JSON Backup</button>
      </div>
      <div class="card" id="reminder-tools-card">
        <div class="card-title">✉️ Email reminders</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">The scheduled job checks every 10 minutes. These buttons ask it to act on the next check instead of waiting for the weekly window.</div>
        <div id="reminder-status" style="font-size:12px;margin-bottom:10px;"></div>
        <button class="btn btn-ghost" onclick="requestReminderRun('smoke')">📧 Send a test email to the league inbox</button>
        <button class="btn btn-primary" onclick="requestReminderRun('vote')">🔔 Send vote reminders now</button>
      </div>""")

rep("    S.rsvpAll=(S_me.organizer&&S_me.verified)?", """    S.reminderRequest=(S_me.organizer&&S_me.verified)?(await getKV('reminder_request')):null;
    S.reminderLastRun=(S_me.organizer&&S_me.verified)?(await getKV('reminder_last_run')):null;
    S.rsvpAll=(S_me.organizer&&S_me.verified)?""")

rep("async function togglePaid(id){recordPaymentUI(id);}", r"""async function togglePaid(id){recordPaymentUI(id);}
// Email is sent by the scheduled job, never by the browser: these buttons only queue the request.
async function requestReminderRun(kind){
  if(!adminUnlocked)return toast('Organizer verification required','warn');
  const n=upcomingSessionNumber();
  if(kind==='vote'&&!confirm(`Send vote reminders for Session ${n} to everyone who has not answered?\n\nWhile the league is in test mode these go to the league inbox, not to players.`))return;
  try{
    await setKV('reminder_request',{kind,id:String(Date.now()),at:new Date().toISOString(),session:n,by:myEmail()});
    await loadAll();renderAll();
    toast(kind==='smoke'?'Test email queued — sent within about 10 minutes':`Reminders for Session ${n} queued — sent within about 10 minutes`,'success');
  }catch(e){toast('Not queued: '+e.message,'error');}
}
function renderReminderTools(){
  const el=document.getElementById('reminder-status');if(!el)return;
  const req=S.reminderRequest,last=S.reminderLastRun;
  const fmt=x=>{const d=new Date(x);return isNaN(d)?String(x):d.toLocaleString('en-CA',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});};
  let html='';
  if(req&&req.kind)html+=`<div class="alert alert-info" style="margin-bottom:8px;" id="reminder-pending">⏳ ${req.kind==='smoke'?'Test email':'Vote reminders'} requested ${fmt(req.at)} — waiting for the next check (within about 10 minutes).</div>`;
  if(last&&last.at){
    const mode=last.mode==='live'?'<span style="color:var(--green2);">live — players receive these</span>':last.mode==='test-inbox'?'<span style="color:var(--yellow2);">test — everything goes to the league inbox</span>':'<span style="color:var(--muted);">dry run — nothing is sent</span>';
    html+=`<div id="reminder-last">Last check <strong>${fmt(last.at)}</strong> · ${mode}<br>${last.sent||0} email${last.sent===1?'':'s'} sent${last.planned!==undefined?` of ${last.planned} planned`:''}${last.note?`<br><span style="color:var(--muted);">${esc(last.note)}</span>`:''}</div>`;
  }else html+='<div id="reminder-last" style="color:var(--muted);">No check recorded yet.</div>';
  el.innerHTML=html;
}""")
rep("renderAnnouncementsAdmin();renderSnapshots();}", "renderAnnouncementsAdmin();renderSnapshots();renderReminderTools();}")
p.write_text(s); print("patched")
