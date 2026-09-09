#!/usr/bin/env python3
"""Phase 4: voting made simple. One-tap vote links (?vote=coming&s=N), spare seats filled automatically from
declined regulars, reminder opt-out, organizer view of confirmed spares, permit wording."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)

# ── Wording from the organizer ───────────────────────────────────────────────────────────────────
rep("""      • School cancellation: no cash refund — regulars get two shuttlecocks, a paid spare gets the $20 back.<br>""",
    """      • Six Tuesdays are already cancelled by the school (see Schedule). If the school cancels any of the 28 approved dates later, there is no cash refund: regulars receive two shuttlecocks, a paid spare gets the $20 back.<br>
      • Spares: when a regular votes “not coming”, a seat opens and spares who said “available” are confirmed in the order they answered; the rest stay on standby.<br>""")
rep("""No cash refund for school cancellations: regulars receive two physical shuttlecocks; a paid spare gets the $20 back.</div></div>`;""",
    """These six dates are already cancelled by the school and are not part of the 28 sessions. If the school cancels any of the 28 approved dates later, there is no cash refund: regulars receive two physical shuttlecocks; a paid spare gets the $20 back.</div></div>`;""")
rep("""    <div style="font-size:12px;color:var(--teal2);margin-top:8px;">🏫 Brand new school · Excellent ceiling · Top-quality floors</div>\n""", "")

# ── Data: keep the answer rows (with their times) and each player's reminder preference ───────────
rep("      S.rsvp={};(rows||[]).forEach(r=>{S.rsvp[r.player_id]=r.response;});\n    }",
    "      S.rsvp={};S.rsvpRows=rows||[];(rows||[]).forEach(r=>{S.rsvp[r.player_id]=r.response;});\n    }")
rep("      return{id:p.id,name:p.name,email:p.email||'',", "      return{id:p.id,emailReminders:p.email_reminders!==false,name:p.name,email:p.email||'',")

# ── Vote card ────────────────────────────────────────────────────────────────────────────────────
start = s.index("function renderRSVPInto(el,compact){"); end = s.index("\nasync function loadAll(){")
s = s[:start] + r"""// Seats: each declined regular opens one seat; spares who answered "available" take seats in answer order.
function isRegularMember(p){return !!p&&p.approved&&!p.waitlisted&&p.membershipType!=='spare';}
function isSpareMember(p){return !!p&&p.approved&&p.membershipType==='spare';}
function spareSeats(){
  const rows=S.rsvpRows||[];const byId=id=>S.players.find(p=>p.id===id);
  const declined=rows.filter(r=>r.response==='notcoming'&&isRegularMember(byId(r.player_id))).length;
  const claims=rows.filter(r=>r.response==='coming'&&isSpareMember(byId(r.player_id)))
    .sort((a,b)=>String(a.updated_at).localeCompare(String(b.updated_at))||a.player_id-b.player_id)
    .map((r,i)=>({id:r.player_id,rank:i+1,confirmed:i<declined}));
  return{declined,claims,open:Math.max(declined-claims.length,0)};
}
async function setEmailReminders(on){
  try{await rpc('set_email_reminders',{p_on:!!on});const me=myPlayer();if(me)me.emailReminders=!!on;toast(on?'Reminders on':'Reminders off','success');}
  catch(e){toast('Preference not saved: '+e.message,'error');}
}
// One-tap vote links from reminder emails: /?vote=coming&s=12 (applied once signed in).
let _pendingVote=null;
try{const q=new URLSearchParams(location.search);if(q.get('vote')&&q.get('s')){_pendingVote={vote:q.get('vote')==='coming',session:parseInt(q.get('s'))};history.replaceState(null,'',location.pathname);}}catch(e){}
async function applyPendingVote(){
  if(!_pendingVote)return;const pv=_pendingVote;_pendingVote=null;
  if(!myPlayer()||!myPlayer().approved){toast('Your registration must be approved before you can vote','warn');return;}
  if(pv.session!==upcomingSessionNumber()){toast(`That link was for Session ${pv.session}; voting is now open for Session ${upcomingSessionNumber()}`,'warn');nav('home');return;}
  await submitRSVP(pv.vote);nav('home');
}
function renderRSVPInto(el,compact){
  if(!el) return;
  if(compact&&(!userRegistered||seasonComplete())){el.innerHTML='';return;}
  if(seasonComplete()){
    el.innerHTML = '<div class="alert alert-success">Season complete — thank you for playing!</div>';
    return;
  }
  const sessNo=upcomingSessionNumber();
  const rsvpData = S.rsvp || {};
  const me=myPlayer();
  const myRsvp = me ? rsvpData[me.id] : undefined;
  const regulars=S.players.filter(isRegularMember);
  const coming = regulars.filter(p=>rsvpData[p.id]==='coming').length;
  const notComing = regulars.filter(p=>rsvpData[p.id]==='notcoming').length;
  const notResponded = regulars.filter(p=>!rsvpData[p.id]).length;
  const seats=spareSeats();
  const meSpare=isSpareMember(me);
  const myClaim=meSpare?seats.claims.find(c=>c.id===me.id):null;
  const fmt=d=>d.toLocaleString('en-CA',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

  let html = compact?'':`<div class="alert alert-info">📋 RSVP for Session ${sessNo}${S.current?' (tonight)':''}</div>`;
  html += `<div class="card"><div class="card-title">🗳️ ${meSpare?'Spare':'Vote'}: are you ${meSpare?'available for':'playing'} Session ${sessNo} (${DATES[sessNo-1]||''})?</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;text-align:center;">
      <div><div style="font-size:20px;font-weight:800;color:var(--green2);">${coming}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Coming</div></div>
      <div><div style="font-size:20px;font-weight:800;color:var(--red2);">${notComing}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Not Coming</div></div>
      <div><div style="font-size:20px;font-weight:800;color:var(--muted);">${notResponded}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">No Reply</div></div>
    </div>
    <div class="spare-seats-line" style="font-size:12px;color:var(--muted);margin-bottom:8px;">Spare seats: <strong style="color:var(--text);">${seats.open} open</strong> · ${seats.claims.filter(c=>c.confirmed).length} confirmed · ${seats.claims.filter(c=>!c.confirmed).length} standby</div>`;
  const startAt=FD[sessNo-1];
  if(startAt&&!meSpare){
    const cutoff=new Date(startAt.getTime()-FEES.absenceNoticeHours*3600000);
    const open=Date.now()<=cutoff.getTime();
    html += `<div style="font-size:11px;color:${open?'var(--muted)':'var(--yellow2)'};margin-bottom:8px;">${open?`$${FEES.absenceRefund} refund if you decline by ${fmt(cutoff)} (72 hours before play).`:`The 72-hour refund window closed ${fmt(cutoff)}; you can still update your answer.`}</div>`;
  }
  if(me&&me.approved){
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button class="btn ${myRsvp==='coming'?'btn-success':'btn-ghost'}" onclick="submitRSVP(true)" style="margin:0;">✅ ${meSpare?"I'm available":"I'm Coming"}</button>
      <button class="btn ${myRsvp==='notcoming'?'btn-danger':'btn-ghost'}" onclick="submitRSVP(false)" style="margin:0;">❌ ${meSpare?'Not available':'Not Coming'}</button>
    </div>`;
    if(meSpare&&myRsvp==='coming'&&myClaim){
      html += myClaim.confirmed
        ? `<div class="alert alert-success spare-status" style="text-align:center;margin-top:10px;">🎉 Seat confirmed (seat ${myClaim.rank}). Please e-transfer $${FEES.spareSession} to ${ORGANIZER_ETRANSFER} before Tuesday.</div>`
        : `<div class="alert alert-warn spare-status" style="text-align:center;margin-top:10px;">⏳ Standby — you are #${myClaim.rank-seats.declined} in line. You will be emailed the moment a seat opens.</div>`;
    }else if(myRsvp){
      html += `<div class="alert alert-success" style="text-align:center;margin-top:10px;">${myRsvp === 'coming' ? '✅ You confirmed - See you there!' : '❌ Noted - Sit this one out'} · You can change your answer above.</div>`;
    }
    html += `<label class="chk-row" style="margin-top:12px;margin-bottom:0;"><input type="checkbox" class="email-reminders-toggle" ${me.emailReminders!==false?'checked':''} onchange="setEmailReminders(this.checked)"><span style="font-size:12px;color:var(--muted);">Email me a reminder when I have not answered${meSpare?' and when a seat opens':''}</span></label>`;
  }else{
    html += `<div class="alert alert-warn">Your registration must be approved before you can RSVP.</div>`;
  }
  html += `</div>`;

  if(adminUnlocked&&!compact){
    const tagFor=(p)=>{const st=rsvpData[p.id];if(isSpareMember(p)){const c=seats.claims.find(x=>x.id===p.id);return st==='coming'?(c&&c.confirmed?'<span class="tag tg-green">✅ Seat confirmed</span>':'<span class="tag tg-yellow">⏳ Standby</span>'):st==='notcoming'?'<span class="tag tg-red">❌ Not available</span>':'<span class="tag tg-gray">⏳ No answer</span>';}
      return `<span class="tag ${st === 'coming' ? 'tg-green' : st === 'notcoming' ? 'tg-red' : 'tg-gray'}">${st === 'coming' ? '✅ Coming' : st === 'notcoming' ? '❌ Not Coming' : '⏳ Not Responded'}</span>`;};
    html += `<div class="card"><div class="card-title">📋 RSVP Status</div>`;
    [...S.players.filter(isRegularMember),...S.players.filter(isSpareMember)].forEach(p => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:700;">${esc(p.name)}${isSpareMember(p)?'<span class="spare-badge">SPARE</span>':''}</div>${tagFor(p)}
      </div>`;
    });
    html += `</div>`;
  }
  el.innerHTML = html;
}
""" + s[end:]
rep("const FEES={", "const ORGANIZER_ETRANSFER='christygeorge993@gmail.com';\nconst FEES={")

# ── Organizer: confirmed spares for the night, seated in one tap ──────────────────────────────────
rep("""  // Save button
  html+=`<button class="btn btn-primary" onclick="saveAttendanceTab()">💾 Save Attendance</button>`;""",
"""  // Spares confirmed by the vote (declined regulars open the seats)
  const seatsTonight=spareSeats();
  if(seatsTonight.claims.length){
    html+=`<div class="card" id="confirmed-spares"><div class="card-title">🎟️ Spares for Session ${sessionNum}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">${seatsTonight.declined} regular${seatsTonight.declined===1?'':'s'} declined · ${seatsTonight.claims.filter(c=>c.confirmed).length} confirmed · ${seatsTonight.claims.filter(c=>!c.confirmed).length} standby. Confirmed spares are seated on the lowest open court.</div>`;
    seatsTonight.claims.forEach(c=>{
      const p=S.players.find(x=>x.id===c.id);if(!p)return;
      const seated=S.current?Object.values(S.current.assignments).some(a=>(a||[]).includes(p.id)):p.currentCourt>0;
      html+=`<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border);">
        ${avatar(p.name,'sm')}
        <span style="flex:1;font-size:12px;font-weight:700;">${esc(p.name)} ${c.confirmed?'<span class="tag tg-green">confirmed</span>':'<span class="tag tg-yellow">standby</span>'}${p.paid?' <span class="tag tg-green">$'+FEES.spareSession+' paid</span>':' <span class="tag tg-gray">$'+FEES.spareSession+' pending</span>'}</span>
        ${seated?'<span class="tag tg-teal">seated</span>':`<button class="btn btn-success btn-sm" style="padding:3px 8px;font-size:10px;margin:0;" onclick="callInSpare(${p.id})">🪑 Seat</button>`}
      </div>`;
    });
    html+=`</div>`;
  }
  // Save button
  html+=`<button class="btn btn-primary" onclick="saveAttendanceTab()">💾 Save Attendance</button>`;""")

# ── Apply a vote carried in the link once the player is signed in ────────────────────────────────
rep("checkRegistrationStatus();renderAll();startSync();setInterval(renderHome,30000);registerServiceWorker();registrationFirst();",
    "checkRegistrationStatus();renderAll();startSync();setInterval(renderHome,30000);registerServiceWorker();registrationFirst();applyPendingVote();")
rep("toast('Signed in as '+myEmail(),'success');registrationFirst();}", "toast('Signed in as '+myEmail(),'success');registrationFirst();applyPendingVote();}")
rep("""    S.rsvp={...(S.rsvp||{}),[me.id]:response};
    renderRSVP();""","""    S.rsvp={...(S.rsvp||{}),[me.id]:response};
    S.rsvpRows=[...(S.rsvpRows||[]).filter(r=>r.player_id!==me.id),{player_id:me.id,response,updated_at:new Date().toISOString()}];
    renderRSVP();
    loadAll().then(()=>renderAll()).catch(()=>{}); // seat order comes from the database clock""")
p.write_text(s); print("patched")
