#!/usr/bin/env python3
"""Phase 2 patch: 2026–27 permit dates as data, five-player Court 6, strict scores, deterministic ties,
vote-first Home, registration-first sign-in, season rules. Run from repo root after p01."""
import re, pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)
def rep_all(old, new):
    global s
    n = s.count(old); assert n, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new); return n

# ── 1. Season data from permit 2026-07-21-0001 (last modified Sep 8, 2026) ─────────────────────
start = s.index("const DATES=['Apr 7'"); end = s.index("const NC=6,NCYC=99,NG=3;")
s = s[:start] + r"""// Permit 2026-07-21-0001 (OCDSB, last modified Sep 8, 2026): 28 approved Tuesdays, 6 cancelled dates.
// Play time shown to players: 8:00–10:00 PM (organizer's instruction). Facility permit window is 8:15–10:15 PM.
const SEASON_LABEL='2026–27';
const SESSION_TIME_LABEL='8:00–10:00 PM';
const APPROVED_DATES=['2026-09-15','2026-09-22','2026-09-29','2026-10-06','2026-10-13','2026-10-20','2026-10-27','2026-11-03','2026-11-10','2026-11-17','2026-11-24','2026-12-15','2027-01-05','2027-01-19','2027-01-26','2027-02-02','2027-02-09','2027-02-16','2027-02-23','2027-03-02','2027-03-09','2027-03-23','2027-03-30','2027-04-13','2027-04-20','2027-05-04','2027-05-11','2027-05-18'];
const CANCELLED_DATES=['2026-12-01','2026-12-08','2027-01-12','2027-04-06','2027-04-27','2027-05-25'];
const FEES={regularSeason:400,spareSession:20,absenceRefund:14,absenceNoticeHours:72,facilityShuttles:2};
function fmtDate(iso){const[y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d,12).toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'});}
const DATES=APPROVED_DATES.map(fmtDate);
// Local wall-clock 8:00 PM on each date (players are in the Ottawa time zone; DST handled by the browser).
const FD=APPROVED_DATES.map(iso=>{const[y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d,20,0,0);});
""" + s[end:]
rep("const NC=6,NCYC=99,NG=3; // NCYC=99: no hard cap on rounds, admin ends session when ready",
    "const NC=6,NCYC=99,NG=3,MAXG=5; // NG: games per round on a 2–4 player court; MAXG: games on the five-player court\n"
    "function courtGames(n){return n===5?5:3;}            // every court plays 3 games, except five players play 5\n"
    "function courtTarget(n){return n===5?15:21;}         // five-player games go to 15, everything else to 21\n"
    "function courtCap(c){return c===NC?5:4;}             // only Court 6 may hold a fifth player")
# session counters that assumed eight dates
rep("let ni=FD.findIndex(d=>d>now);if(ni===-1)ni=7;","let ni=FD.findIndex(d=>d>now);if(ni===-1)ni=DATES.length-1;")
rep("if(nd)nd.textContent=S.sessions.length>=8?'Season Complete! 🎉':`Session ${ni+1} — ${DATES[ni]}, 2026`;",
    "if(nd)nd.textContent=S.sessions.length>=DATES.length?'Season Complete! 🎉':`Session ${ni+1} — ${DATES[ni]}`;")
rep("if(cd&&ni<8){","if(cd&&ni<DATES.length){")
rep("const n=S.sessions.length+1;if(n>8)return toast('All 8 done!','warn');","const n=S.sessions.length+1;if(n>DATES.length)return toast('All '+DATES.length+' sessions are done!','warn');")
rep("${n>8?'disabled':''}","${n>DATES.length?'disabled':''}")
rep("""Session ${i+1} — ${d}, 2026</div>
        <div style="font-size:11px;color:var(--muted);">Tuesday · 8:15–10:15 PM</div></div>""",
    """Session ${i+1} — ${d}</div>
        <div style="font-size:11px;color:var(--muted);">Tuesday · ${SESSION_TIME_LABEL}</div></div>""")
rep("""      <span class="tag ${done?'tg-green':act?'tg-teal':'tg-gray'}">${done?'Done':act?'Active':'—'}</span>
    </div>`;
  }).join('');
}""","""      <span class="tag ${done?'tg-green':act?'tg-teal':'tg-gray'}">${done?'Done':act?'Active':'—'}</span>
    </div>`;
  }).join('')+`<div class="card" style="margin-top:12px;"><div class="card-title">No play (school cancellations)</div>${CANCELLED_DATES.map(fmtDate).map(d=>`<div style="font-size:12px;padding:4px 0;color:var(--muted);">✖ ${d}</div>`).join('')}<div style="font-size:11px;color:var(--muted);margin-top:8px;">No cash refund for school cancellations: regulars receive two physical shuttlecocks; a paid spare gets the $20 back.</div></div>`;
}""")
rep("""<div style="font-size:10px;color:var(--muted);">8:15–10:15 PM</div></div>""","""<div style="font-size:10px;color:var(--muted);">${SESSION_TIME_LABEL}</div></div>""")
rep("""<div class="hero-next-sub">Maplewood SS · 8:15–10:15 PM · Gym 127C & 127D</div>""","""<div class="hero-next-sub">Maplewood SS · 8:00–10:00 PM · Gym 127C & 127D</div>""")
rep("""<div class="hero-league">Maplewood Advanced League · 8 Sessions</div>""","""<div class="hero-league">Maplewood Advanced League · 2026–27 · 28 Tuesdays</div>""")
rep("""<div class="hero-club"><span>DC</span> Badminton Club</div>""","""<div class="hero-club"><span>Maplewood</span> League</div>""")
rep("700 Cope Drive, Stittsville · Tuesdays 8:15–10:15 PM · Apr 7 – May 26, 2026","700 Cope Drive, Stittsville · Tuesdays 8:00–10:00 PM · Sep 15, 2026 – May 18, 2027")
rep("• Do not arrive before 8:15 PM; vacate by 10:15 PM sharp","• Play 8:00–10:00 PM; finish play by 10:05 PM and leave by 10:15 PM sharp")
rep("""✅ First session: <strong>Tuesday April 7, 2026 at 8:15 PM</strong>""","""✅ First session: <strong>Tuesday September 15, 2026 at 8:00 PM</strong>""")
rep("""color:var(--teal2);">8:15 PM</div>""","""color:var(--teal2);">8:00 PM</div>""")
rep("""color:var(--teal2);">10:15 PM</div>""","""color:var(--teal2);">10:00 PM</div>""")
rep("msg+=`📍 Maplewood SS · 700 Cope Drive\\n⏰ 8:15–10:15 PM`;","msg+=`📍 Maplewood SS · 700 Cope Drive\\n⏰ ${SESSION_TIME_LABEL}`;")

# ── 2. Five-player court: K5 rotation, every pair partners once, everyone rests once ───────────
rep("""  }else if(n===3){
    const[A,B,C]=players;
    return[
      {g:1,t:'Game 1',ta:A.name,tb:B.name,md:'(A vs B — Singles)',a1:A.id,a2:null,b1:B.id,b2:null},""",
"""  }else if(n===5){
    const[A,B,C,D,E]=players;
    const mk=(g,x,y,z,w,r)=>({g,t:`Game ${g}`,ta:`${x.name} & ${y.name}`,tb:`${z.name} & ${w.name}`,md:`(${r.name} rests)`,a1:x.id,a2:y.id,b1:z.id,b2:w.id,rest:r.id});
    return[mk(1,B,E,C,D,A),mk(2,C,A,D,E,B),mk(3,D,B,E,A,C),mk(4,E,C,A,B,D),mk(5,A,D,B,C,E)];
  }else if(n===3){
    const[A,B,C]=players;
    return[
      {g:1,t:'Game 1',ta:A.name,tb:B.name,md:'(A vs B — Singles)',a1:A.id,a2:null,b1:B.id,b2:null},""")
n = rep_all("pids.length===3?3:NG","courtGames(pids.length)")
n += rep_all("courtPlayers===3?3:NG","courtGames(courtPlayers)")
n += rep_all("players.length===3?3:NG","courtGames(players.length)")
assert n >= 7, n
n = rep_all("for(let g=1;g<=NG;g++)","for(let g=1;g<=MAXG;g++)")
n += rep_all("for(let g2=1;g2<=NG;g2++)","for(let g2=1;g2<=MAXG;g2++)")
assert n >= 10, n
rep_all("for(let g=1;g<=3;g++){\n      const aEl=document.getElementById(`si_${court}_${g}_a`);","for(let g=1;g<=MAXG;g++){\n      const aEl=document.getElementById(`si_${court}_${g}_a`);")
rep_all("for(let g=1;g<=3;g++){\n    const key=`c${court}_y${cy}_g${g}`;","for(let g=1;g<=MAXG;g++){\n    const key=`c${court}_y${cy}_g${g}`;")
rep("const modeLabel=n===4?'Doubles (4 players)':n===3?'⚠️ 3 Players — Round-Robin Singles':'⚠️ 2 Players — Singles Best of 3';",
    "const modeLabel=n===5?'Five players — rotating doubles, 5 games to 15':n===4?'Doubles (4 players) — 3 games to 21':n===3?'⚠️ 3 Players — Round-Robin Singles':'⚠️ 2 Players — Singles Best of 3';")
rep("const labels=['A','B','C','D'];","const labels=['A','B','C','D','E'];")
rep("const gridCols=n===2?'1fr 1fr':n===3?'1fr 1fr 1fr':'1fr 1fr';","const gridCols=n===2?'1fr 1fr':n===3?'1fr 1fr 1fr':n===5?'1fr 1fr 1fr':'1fr 1fr';")
# overflow: Court 6 may keep a fifth player; other courts hold four
n = rep_all("for(let c=1;c<=NC;c++)while(na[c].length>4){const ov=na[c].pop();const t=c<NC?c+1:c-1;na[t].unshift(ov);}",
            "for(let c=1;c<=NC;c++)while(na[c].length>courtCap(c)){const ov=na[c].pop();const t=c<NC?c+1:c-1;na[t].unshift(ov);}")
assert n == 2, n
rep("for(let c=1;c<=NC;c++)while(_finalA[c].length>4){const ov=_finalA[c].pop();const t=c<NC?c+1:c-1;_finalA[t].unshift(ov);}",
    "for(let c=1;c<=NC;c++)while(_finalA[c].length>courtCap(c)){const ov=_finalA[c].pop();const t=c<NC?c+1:c-1;_finalA[t].unshift(ov);}")
rep("for(let c=1;c<=NC;c++)while(computed[c].length>4){const ov=computed[c].pop();const t=c<NC?c+1:c-1;computed[t].unshift(ov);}",
    "for(let c=1;c<=NC;c++)while(computed[c].length>courtCap(c)){const ov=computed[c].pop();const t=c<NC?c+1:c-1;computed[t].unshift(ov);}")
rep("if(pl.length>4){toast('Court '+c+' has more than 4 players!','warn');ok=false;}",
    "if(pl.length>courtCap(c)){toast('Court '+c+' has more than '+courtCap(c)+' players!','warn');ok=false;}")

# ── 3. Strict scores: winner exactly at the court target, loser below it, never a tie ───────────
rep("""  if(isNaN(sa)||isNaN(sb)){w.innerHTML='';return;}
  if(sa>21||sb>21){a.className='sinp';b.className='sinp';w.innerHTML=`<span class="tag tg-red">❌ Max score is 21 — games are first to 21, no deuce</span>`;return;}
  if(sa>sb){a.className='sinp win';b.className='sinp lose';w.innerHTML=`<span class="tag tg-green">Team A wins ${sa}–${sb}</span>${sa!==21?' <span style="color:var(--yellow2);">(⚠ Neither team at 21 — check score)</span>':''}`;
  }else if(sb>sa){b.className='sinp win';a.className='sinp lose';w.innerHTML=`<span class="tag tg-green">Team B wins ${sb}–${sa}</span>${sb!==21?' <span style="color:var(--yellow2);">(⚠ Neither team at 21 — check score)</span>':''}`;
  }else if(sa>0){a.className='sinp';b.className='sinp';w.innerHTML=`<span class="tag tg-yellow">⚠️ Tied ${sa}–${sb} — Not valid! One team must reach 21</span>`;}""",
"""  if(isNaN(sa)||isNaN(sb)){w.innerHTML='';return;}
  const T=courtTarget((S.current?.assignments?.[c]||[]).length);
  const v=validScore(sa,sb,T);
  if(v.error){a.className='sinp';b.className='sinp';w.innerHTML=`<span class="tag tg-red">❌ ${v.error}</span>`;return;}
  if(sa>sb){a.className='sinp win';b.className='sinp lose';w.innerHTML=`<span class="tag tg-green">Team A wins ${sa}–${sb}</span>`;}
  else{b.className='sinp win';a.className='sinp lose';w.innerHTML=`<span class="tag tg-green">Team B wins ${sb}–${sa}</span>`;}""")
rep("""async function saveGameScore(court,gameNum){""",
"""// A finished game: the winner has exactly the target (21, or 15 on the five-player court), the loser fewer. No ties, no over-scores.
function validScore(sa,sb,T){
  if(!Number.isInteger(sa)||!Number.isInteger(sb)||sa<0||sb<0)return{error:'Enter both scores'};
  if(sa===sb)return{error:`Tied ${sa}–${sb} is not a finished game — one side must reach ${T}`};
  const hi=Math.max(sa,sb),lo=Math.min(sa,sb);
  if(hi>T)return{error:`Games end at ${T} — no deuce`};
  if(hi<T)return{error:`The winner must reach ${T} (entered ${hi})`};
  if(lo>=T)return{error:`Only one side can reach ${T}`};
  return{ok:true};
}
async function saveGameScore(court,gameNum){""")
rep("""  if(isNaN(sa)||isNaN(sb)){toast('Enter both scores','warn');return;}
  if(sa<0||sb<0){toast('No negative scores','warn');return;}
  if(sa>21||sb>21){toast('Max score is 21 — games end at first to 21','warn');return;}
  if(sa===sb&&!confirm(`Game ${gameNum}: tied ${sa}–${sb}. Save anyway?`)){return;}
  const key=`c${court}_y${cy}_g${gameNum}`;""",
"""  {const v=validScore(sa,sb,courtTarget(players.length));if(v.error){toast(v.error,'warn');return;}}
  const key=`c${court}_y${cy}_g${gameNum}`;""")
rep("""    if(isNaN(sa)||isNaN(sb)){toast('Enter all 3 scores','warn');valid=false;return;}
    if(sa<0||sb<0){toast('No negative scores','warn');valid=false;return;}
    if(sa>21||sb>21){toast('Max score is 21 — games end at first to 21','warn');valid=false;return;}
    if(sa===sb&&!confirm(`Game ${g}: tied ${sa}–${sb}. Save anyway?`)){valid=false;return;}""",
"""    if(isNaN(sa)||isNaN(sb)){toast(`Enter all ${combos.length} scores`,'warn');valid=false;return;}
    {const v=validScore(sa,sb,courtTarget(players.length));if(v.error){toast(`Game ${g}: `+v.error,'warn');valid=false;return;}}""")

# ── 4. Ties resolve deterministically: head-to-head, then points conceded, then earlier registration ─
rep("""async function applyRotation(){""",
"""// Deterministic tie-break inside a court: head-to-head games won between the tied players,
// then fewer points conceded, then lower player id (earlier registration). Same rule everywhere.
function tieOrder(ids,cy,ptAgainst){
  const h2h={};ids.forEach(i=>h2h[i]=0);
  for(let c=1;c<=NC;c++)for(let g=1;g<=MAXG;g++){
    const sc=S.current?.scores?.[`c${c}_y${cy}_g${g}`];if(!sc)continue;
    const A=[sc.a1,sc.a2].filter(x=>x!=null),B=[sc.b1,sc.b2].filter(x=>x!=null);
    const tiedA=A.filter(i=>ids.includes(i)),tiedB=B.filter(i=>ids.includes(i));
    if(!tiedA.length||!tiedB.length)continue; // only games where tied players opposed each other
    if(sc.w==='A')tiedA.forEach(i=>h2h[i]++);else if(sc.w==='B')tiedB.forEach(i=>h2h[i]++);
  }
  return[...ids].sort((x,y)=>h2h[y]-h2h[x]||(ptAgainst[x]||0)-(ptAgainst[y]||0)||x-y);
}
async function applyRotation(){""")
rep("""          winnerId=await tossPrompt({court:c,direction:'up',players:tiedPlayers});
          if(winnerId==null)throw new Error('TOSS_CANCELLED');""",
"""          void tiedPlayers;
          winnerId=tieOrder(topGroup.map(s=>s.id),cy,ptAgainst)[0];""")
rep("""          loserId=await tossPrompt({court:c,direction:'down',players:tiedPlayers});
          if(loserId==null)throw new Error('TOSS_CANCELLED');""",
"""          void tiedPlayers;
          loserId=tieOrder(botGroup.map(s=>s.id),cy,ptAgainst).slice(-1)[0];""")
# display order must agree with rotation order
rep("""    if(dx!==dy)return dy-dx;
    return x-y;
  });
  const pT=preTosses||{};""","""    if(dx!==dy)return dy-dx;
    const o=tieOrder([x,y],cy,ptAgainst);return o[0]===x?-1:1;
  });
  const pT=preTosses||{};""")

# ── 5. Vote first: the RSVP card also sits at the top of Home ──────────────────────────────────
rep("""  <div id="pos-home"></div>
  <div id="ann-home"></div>""","""  <div id="home-vote"></div>
  <div class="card" id="season-rules-card">
    <div class="card-title">📜 Season rules 2026–27</div>
    <div style="font-size:12px;line-height:1.6;">
      • 28 Tuesdays, ${'8:00–10:00 PM'}, Maplewood SS gyms 127C & 127D. Six courts.<br>
      • Regular season $400 (25 players). Spare session $20, confirmed only after Christy verifies the e-transfer.<br>
      • Vote every week. Decline at least 72 hours before start for a $14 refund; later notice or a no-show earns no refund.<br>
      • School cancellation: no cash refund — regulars get two shuttlecocks, a paid spare gets the $20 back.<br>
      • Verified no-show: one court down next week. A missing vote alone is not a no-show.<br>
      • When all 25 play, Court 6 runs five players rotating through five games to 15; other courts play three games to 21. Everyone rests once and the first rest rotates each week.<br>
      • Christy sets initial seeding; results then move players up and down one court. Ties are settled automatically (head-to-head, then points conceded).
    </div>
  </div>
  <div id="pos-home"></div>
  <div id="ann-home"></div>""")
s = s.replace("• 28 Tuesdays, ${'8:00–10:00 PM'}, Maplewood","• 28 Tuesdays, 8:00–10:00 PM, Maplewood")
rep("""function renderRSVP(){
  const el = document.getElementById('sec-vote');
  if(!el) return;""","""function renderRSVP(){
  renderRSVPInto(document.getElementById('sec-vote'));
  renderRSVPInto(document.getElementById('home-vote'),true);
}
function renderRSVPInto(el,compact){
  if(!el) return;
  if(compact&&(!userRegistered||!S.current)){el.innerHTML='';return;}""")
rep("""  if(adminUnlocked){
    html += `<div class="card"><div class="card-title">📋 RSVP Status</div>`;
    S.players.filter(p=>p.approved).forEach(p => {""","""  if(adminUnlocked&&!compact){
    html += `<div class="card"><div class="card-title">📋 RSVP Status</div>`;
    S.players.filter(p=>p.approved).forEach(p => {""")
rep("""  let html = `<div class="alert alert-info">📋 RSVP for Session ${S.current.number}</div>`;
  html += `<div class="card"><div class="card-title">Attendance Confirmation</div>""",
"""  let html = compact?'':`<div class="alert alert-info">📋 RSVP for Session ${S.current.number}</div>`;
  html += `<div class="card"><div class="card-title">🗳️ Vote: are you playing Session ${S.current.number} (${DATES[S.current.number-1]||''})?</div>""")

# ── 6. Registration first: a signed-in person without a record goes straight to Register ─────────
rep("""async function afterSignIn(){showGate(false);setSS('syncing');const ok=await loadAll();if(ok){setSS('ok');checkRegistrationStatus();renderAll();startSync();toast('Signed in as '+myEmail(),'success');}else{setSS('err');toast('Cannot load league data','error');}}""",
"""async function afterSignIn(){showGate(false);setSS('syncing');const ok=await loadAll();if(ok){setSS('ok');checkRegistrationStatus();renderAll();startSync();toast('Signed in as '+myEmail(),'success');registrationFirst();}else{setSS('err');toast('Cannot load league data','error');}}
// First thing after sign-in for someone without a player record: the registration form.
function registrationFirst(){if(S_me.organizer)return;const me=myPlayer();if(!me){nav('register');toast('Welcome! Please complete your registration first.','info');}else if(!me.approved){nav('register');}}""")
rep("""    checkRegistrationStatus();renderAll();startSync();setInterval(renderHome,30000);registerServiceWorker();""",
    """    checkRegistrationStatus();renderAll();startSync();setInterval(renderHome,30000);registerServiceWorker();registrationFirst();""")

p.write_text(s)
print("patched", len(s))
# (applied inline during development) remove the dangling else left by the old validation block
