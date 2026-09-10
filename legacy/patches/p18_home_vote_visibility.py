#!/usr/bin/env python3
"""The Home vote card is never silently missing: players who are not yet approved (or not registered) see why."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)
rep("""  if(compact&&(!userRegistered||seasonComplete())){el.innerHTML='';return;}""",
"""  if(compact&&seasonComplete()){el.innerHTML='';return;}
  if(compact&&!userRegistered){
    const me0=myPlayer();
    el.innerHTML=`<div class="card" id="home-vote-pending"><div class="card-title">🗳️ Vote: Session ${upcomingSessionNumber()} (${DATES[upcomingSessionNumber()-1]||''})</div>
      <div style="font-size:13px;">${me0?(me0.waitlisted?'You are on the waitlist — voting opens if a regular place frees up.':'Your registration is waiting for the admin\\'s approval — voting opens the moment it is approved.'):'Register first, then you can vote here every week.'}</div>
      ${me0?'':'<button class="btn btn-primary" style="margin-top:10px;" onclick="nav(\\'register\\')">Register now</button>'}
      ${S_me.organizer&&me0&&!me0.approved?`<button class="btn btn-success" style="margin-top:10px;" onclick="approvePlayer(${me0.id})">Approve my own registration (admin)</button>`:''}
    </div>`;
    return;
  }""")
p.write_text(s); print("patched")
