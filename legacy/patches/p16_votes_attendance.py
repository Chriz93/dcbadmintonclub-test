#!/usr/bin/env python3
"""Phase 7: votes drive attendance. Everyone votes on Home by Sunday 8 PM (48 h before play); spares are asked from
Saturday 8 PM (72 h) when a regular declines. Starting the night seats "coming" regulars and confirmed spares,
excuses "not coming" regulars (no court penalty), and pre-marks attendance. 'Christy' becomes 'the admin'."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)

# ── Wording ───────────────────────────────────────────────────────────────────────────────────────
rep("No password needed. Use the email Christy has on file (or the one she invited). If registration says it is closed, ask Christy to invite that address.",
    "No password needed. Use the email the admin has on file (or the one you were invited with). If registration says it is closed, ask the admin to invite that address.")
rep("Spare session $20, confirmed only after Christy verifies the e-transfer.", "Spare session $20, confirmed once the admin verifies the e-transfer.")
rep("• Christy sets initial seeding; results then move players up and down one court.", "• The admin sets the initial seeding; results then move players up and down one court.")
rep("waiting for Christy to advance the round", "waiting for the admin to advance the round")
rep("You already registered this season — Christy will approve it", "You already registered this season — the admin will approve it")
rep("""      • Vote every week. Decline at least 72 hours before start for a $14 refund; later notice or a no-show earns no refund.<br>""",
"""      • Everyone votes on the app every week — Home → “I'm coming” / “Not coming”, or the one-tap link in the reminder email — by <strong>Sunday 8:00 PM</strong> (48 hours before play). Decline by Saturday 8:00 PM (72 hours before) for the $14 refund; later notice or a no-show earns no refund.<br>
      • Spares are asked from Saturday 8:00 PM (3 days before) whenever a regular has declined; seats go in the order spares answer.<br>
      • Your vote is your attendance: “coming” seats you for the night, “not coming” excuses you without a court penalty. Only an unannounced no-show drops a court.<br>""")
rep("const FEES={regularSeason:400,spareSession:20,absenceRefund:14,absenceNoticeHours:72,facilityShuttles:2};",
    "const FEES={regularSeason:400,spareSession:20,absenceRefund:14,absenceNoticeHours:72,voteDeadlineHours:48,spareAskHours:72,facilityShuttles:2};")

# ── Vote card: deadline, refund cutoff, regular/spare split ───────────────────────────────────────
rep("""  const startAt=FD[sessNo-1];
  if(startAt&&!meSpare){
    const cutoff=new Date(startAt.getTime()-FEES.absenceNoticeHours*3600000);
    const open=Date.now()<=cutoff.getTime();
    html += `<div style="font-size:11px;color:${open?'var(--muted)':'var(--yellow2)'};margin-bottom:8px;">${open?`$${FEES.absenceRefund} refund if you decline by ${fmt(cutoff)} (72 hours before play).`:`The 72-hour refund window closed ${fmt(cutoff)}; you can still update your answer.`}</div>`;
  }""",
"""  const startAt=FD[sessNo-1];
  if(startAt){
    const cutoff=new Date(startAt.getTime()-FEES.absenceNoticeHours*3600000);
    const deadline=new Date(startAt.getTime()-FEES.voteDeadlineHours*3600000);
    const spareAsk=new Date(startAt.getTime()-FEES.spareAskHours*3600000);
    const now=Date.now();
    if(meSpare){
      html += `<div class="vote-timing" style="font-size:11px;color:var(--muted);margin-bottom:8px;">${now<spareAsk.getTime()?`Spares are asked from ${fmt(spareAsk)} (3 days before play) whenever a regular declines. You can already say if you are available.`:`Seats open as regulars decline; answer early — seats go in the order spares reply.`}</div>`;
    }else{
      const beforeDeadline=now<=deadline.getTime(),beforeCutoff=now<=cutoff.getTime();
      html += `<div class="vote-timing" style="font-size:11px;color:${beforeDeadline?'var(--muted)':'var(--yellow2)'};margin-bottom:8px;">${beforeDeadline?`Vote by <strong>${fmt(deadline)}</strong> (48 hours before play). `:`The voting deadline (${fmt(deadline)}) has passed — please answer now; spares may already be seated. `}${beforeCutoff?`$${FEES.absenceRefund} refund if you decline by ${fmt(cutoff)}.`:`The 72-hour refund window closed ${fmt(cutoff)}.`}</div>`;
    }
  }""")

# ── Starting the night: seat the "coming" regulars and confirmed spares, excuse the "not coming" ──
rep("""  const initAssign=autoAssign();
  const sess={id:Date.now(),number:n,date:DATES[n-1],cycle:1,assignments:initAssign,initialAssignments:JSON.parse(JSON.stringify(initAssign)),scores:{},movements:[],completed:false,preTosses:{}};
  await setKV('current_session',sess);await loadAll();renderAll();toast('Session '+n+' started!','success');""",
"""  const votes=S.rsvp||{};
  const declined=new Set(S.players.filter(p=>isRegularMember(p)&&votes[p.id]==='notcoming').map(p=>p.id));
  const confirmedSpares=spareSeats().claims.filter(c=>c.confirmed).map(c=>c.id);
  const initAssign=autoAssign(declined,confirmedSpares);
  // Votes become tonight's attendance: coming → present, not coming → excused (no court penalty).
  const attendance={};
  declined.forEach(id=>{attendance[id]='declined';});
  for(let c=1;c<=NC;c++)initAssign[c].forEach(id=>{if(votes[id]==='coming')attendance[id]='present';});
  const sess={id:Date.now(),number:n,date:DATES[n-1],cycle:1,assignments:initAssign,initialAssignments:JSON.parse(JSON.stringify(initAssign)),scores:{},movements:[],completed:false,preTosses:{},attendance,absentFrom:{}};
  // Seated spares carry their court for the night (the lineup safety net only keeps players with a court).
  const spareCourt=[];for(let c=1;c<=NC;c++)initAssign[c].forEach(id=>{if(confirmedSpares.includes(id))spareCourt.push(sbU('players',id,{current_court:c,highest_court:c}));});
  if(spareCourt.length)await Promise.all(spareCourt);
  await setKV('current_session',sess);await loadAll();renderAll();toast(`Session ${n} started — ${declined.size} excused, ${confirmedSpares.length} spare${confirmedSpares.length===1?'':'s'} seated`,'success');""")
rep("""function autoAssign(){
  const a={};for(let c=1;c<=NC;c++)a[c]=[];
  const sorted=[...activePlayers()].sort((x,y)=>x.currentCourt-y.currentCourt);
  sorted.forEach((p,i)=>{const c=Math.min(Math.floor(i/4)+1,NC);a[c].push(p.id);});
  return a;
}""",
"""// Regulars in order of earned court (spares only when confirmed for the night), four per court, the rest on Court 6.
function autoAssign(exclude=new Set(),spares=[]){
  const a={};for(let c=1;c<=NC;c++)a[c]=[];
  const regulars=activePlayers().filter(p=>p.membershipType!=='spare'&&!exclude.has(p.id));
  const extra=spares.map(id=>S.players.find(p=>p.id===id)).filter(p=>p&&!regulars.includes(p));
  const key=p=>p.currentCourt>0&&p.membershipType!=='spare'?p.currentCourt:NC+1;
  const sorted=[...regulars,...extra].sort((x,y)=>key(x)-key(y));
  sorted.forEach((p,i)=>{const c=Math.min(Math.floor(i/4)+1,NC);a[c].push(p.id);});
  return a;
}""")

# ── Attendance tab: excused players listed separately, spares seated automatically ────────────────
rep("""    <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Mark players present or absent. Absent players are auto-removed from their court. Call in spares to fill open slots.</div>`;""",
"""    <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Votes fill this in: “coming” players start as present, “not coming” players are excused for the night. Mark a no-show absent (one court down next week). Confirmed spares are seated when the night starts.</div>`;""")
rep("""  }
  // Spares confirmed by the vote (declined regulars open the seats)""",
"""  }
  // Regulars who voted "not coming": excused, no court penalty, can still be seated if they turn up.
  const excused=Object.entries(att).filter(([,v])=>v==='declined').map(([id])=>S.players.find(p=>p.id===parseInt(id))).filter(Boolean);
  if(excused.length){
    html+=`<div class="card" id="excused-tonight"><div class="card-title">🙋 Not playing tonight (voted out)</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">${excused.length} regular${excused.length===1?'':'s'} declined in time — no court penalty. Seat them only if they turn up.</div>`;
    excused.forEach(p=>{html+=`<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border);">${avatar(p.name,'sm')}<span style="flex:1;font-size:12px;font-weight:700;">${esc(p.name)} <span class="tag tg-red">excused</span></span>${S.current?`<button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:10px;margin:0;" onclick="callInSpare(${p.id})">🪑 Seat anyway</button>`:''}</div>`;});
    html+=`</div>`;
  }
  // Spares confirmed by the vote (declined regulars open the seats)""")
rep("""${seatsTonight.declined} regular${seatsTonight.declined===1?'':'s'} declined · ${seatsTonight.claims.filter(c=>c.confirmed).length} confirmed · ${seatsTonight.claims.filter(c=>!c.confirmed).length} standby. Confirmed spares are seated on the lowest open court.""",
    """${seatsTonight.declined} regular${seatsTonight.declined===1?'':'s'} declined · ${seatsTonight.claims.filter(c=>c.confirmed).length} confirmed · ${seatsTonight.claims.filter(c=>!c.confirmed).length} standby. Confirmed spares are seated automatically when the night starts.""")
p.write_text(s); print("patched")
