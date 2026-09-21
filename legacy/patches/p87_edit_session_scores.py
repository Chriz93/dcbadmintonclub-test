# p87 (September 20, 2026): the organizer can correct a score after the round has moved on.
#  From the organizer, after typing the wrong result into Court 6: "I mistakenly entered a score on court 6 round 2.
#  It is supposed to be Bao who is moving to court 5" — and then: "make a edit option for admin, for any sessions,
#  between sessions or past sessions".
#  Until now the only way back was Admin → Tools → Undo Last Round, which reopens the whole round for every court.
#  Now Admin → ✏️ Edit scores picks a session, a round and a court, shows the games as they were recorded, and takes a
#  corrected score. On save the night is worked out again from the corrected score: the rotation for every round that
#  was rotated is re-run (p86), so the arrows, the courts and the ratings all follow the result that really happened.
#  What can be edited, and why it stops there (the organizer's own rule: "this should only be done to the last
#  finished session or current session which is on going"):
#   * while a session is live, only that session — the completed ones behind it already decided tonight's courts;
#   * with no session live, only the most recently completed one — editing an older night would move the courts every
#     night since then started from, and that cascade is not something a correction should set off.
#  A correction to an earlier round of a live session is refused by the database when the round now being played
#  already has scores on a court whose line-up would change; the editor says so and points at Undo Last Round.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# The tab, beside the other things that belong to a session.
sub("""      <button class="ptab" onclick="showSec('admin','a-assign',this)">🏟️ Assign</button>
      </div>""",
    """      <button class="ptab" onclick="showSec('admin','a-assign',this)">🏟️ Assign</button>
      <button class="ptab" onclick="showSec('admin','a-edit',this)">✏️ Edit scores</button>
      </div>""")
sub("""    <div id="sec-a-reg" class="section"></div>""",
    """    <div id="sec-a-edit" class="section"></div>
    <div id="sec-a-reg" class="section"></div>""")

# ── The editor ────────────────────────────────────────────────────────────────────────────────────
sub("""let _activeLoads=0;""",
    """// p87: which session, round and court the score editor is showing.
let _edSess=null,_edRound=null,_edCourt=null;
// Only the night that is being played, or — when none is — the one that finished last. See the patch header.
function editableSession(){
  if(S.current)return{sess:S.current,live:true};
  const done=[...(S.sessions||[])].filter(Boolean);
  if(!done.length)return null;
  const last=done.reduce((a,b)=>((b.number||0)>=(a.number||0)?b:a));
  return{sess:last,live:false};
}
function sessRounds(sess){const out=new Set();Object.keys(sess&&sess.scores||{}).forEach(k=>{const m=k.match(/_y(\\d+)_/);if(m)out.add(+m[1]);});return[...out].sort((a,b)=>a-b);}
function sessCourtsIn(sess,cy){const out=new Set();Object.keys(sess&&sess.scores||{}).forEach(k=>{const m=k.match(/^c(\\d+)_y(\\d+)_g/);if(m&&+m[2]===cy)out.add(+m[1]);});return[...out].sort((a,b)=>a-b);}
function sessGamesIn(sess,cy,c){const out=[];for(let g=1;g<=MAXG;g++){const sc=(sess.scores||{})[`c${c}_y${cy}_g${g}`];if(sc)out.push({g,sc});}return out;}
// The players that round's scores name on that court — the target (21, or 15 on a five-player court) follows it.
function sessCourtSize(sess,cy,c){const ids=new Set();sessGamesIn(sess,cy,c).forEach(({sc})=>[sc.a1,sc.a2,sc.b1,sc.b2].forEach(id=>{if(id!=null)ids.add(id);}));return ids.size;}
function setEdSess(v){_edSess=v;_edRound=null;_edCourt=null;renderScoreEdit();}
function setEdRound(v){_edRound=parseInt(v)||null;_edCourt=null;renderScoreEdit();}
function setEdCourt(v){_edCourt=parseInt(v)||null;renderScoreEdit();}
function renderScoreEdit(){
  const el=document.getElementById('sec-a-edit');if(!el)return;
  const t=editableSession();
  if(!t){el.innerHTML='<div class="card"><div class="card-title">✏️ Edit scores</div><div style="font-size:12px;color:var(--muted);">No session has been played yet.</div></div>';return;}
  const sess=t.sess,rounds=sessRounds(sess);
  const cy=rounds.includes(_edRound)?_edRound:rounds[rounds.length-1];
  const courts=cy?sessCourtsIn(sess,cy):[];
  const c=courts.includes(_edCourt)?_edCourt:courts[0];
  const games=c?sessGamesIn(sess,cy,c):[];
  const size=c?sessCourtSize(sess,cy,c):4,target=courtTarget(size);
  const rotated=(sess.movements||[]).some(m=>m.cycle===cy);
  let html=`<div class="card" id="score-edit"><div class="card-title">✏️ Edit scores — Session ${sess.number}${t.live?' (tonight)':''}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5;">
      ${t.live?'Tonight’s session is the one that can be corrected. A night that is already finished is left alone once the next one has started.'
              :`Session ${sess.number} finished last, so it is the one that can be corrected. Older nights are left alone: changing one would move the courts every night since then started from.`}
      ${rotated?'<br><strong>Round '+cy+' has already been worked out.</strong> Saving a correction runs that round again from the new score, so the movements, the courts and the ratings follow the real result.':''}
    </div>`;
  if(!rounds.length){el.innerHTML=html+'<div style="font-size:12px;color:var(--muted);">No scores have been entered for this session.</div></div>';return;}
  html+=`<label class="lbl" for="ed-round">Round</label><select class="inp" id="ed-round" onchange="setEdRound(this.value)">`
    +rounds.map(r=>`<option value="${r}"${r===cy?' selected':''}>Round ${r}</option>`).join('')+`</select>
    <label class="lbl" for="ed-court">Court</label><select class="inp" id="ed-court" onchange="setEdCourt(this.value)">`
    +courts.map(x=>`<option value="${x}"${x===c?' selected':''}>Court ${x}</option>`).join('')+`</select>`;
  if(!games.length){el.innerHTML=html+'<div style="font-size:12px;color:var(--muted);margin-top:10px;">No games recorded on this court.</div></div>';return;}
  html+=`<div style="font-size:11px;color:var(--muted);margin:10px 0 4px;">Games go to ${target}${size===5?' (five players on this court)':''}. The pairings are the ones that were played and cannot be changed here.</div>`;
  games.forEach(({g,sc})=>{
    const nm=id=>id==null?'':esc(sessPlayerName(sess,id).split(' ')[0]);
    const A=[sc.a1,sc.a2].filter(x=>x!=null).map(nm).join(' & '),B=[sc.b1,sc.b2].filter(x=>x!=null).map(nm).join(' & ');
    html+=`<div class="ed-game" data-g="${g}" style="display:grid;grid-template-columns:1fr auto auto auto 1fr;gap:6px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:12px;font-weight:700;text-align:right;">${A}</span>
      <input class="sinp" id="ed_${g}_a" inputmode="numeric" maxlength="2" value="${sc.sA==null?'':sc.sA}" aria-label="Game ${g}, ${A}">
      <span style="color:var(--muted);">–</span>
      <input class="sinp" id="ed_${g}_b" inputmode="numeric" maxlength="2" value="${sc.sB==null?'':sc.sB}" aria-label="Game ${g}, ${B}">
      <span style="font-size:12px;font-weight:700;">${B}</span>
    </div>`;
  });
  html+=`<button class="btn btn-primary" id="ed-save" onclick="saveScoreEdits()" style="margin-top:12px;">Save corrections for Court ${c}, Round ${cy}</button>
    <div id="ed-note" style="font-size:11px;color:var(--muted);margin-top:8px;">Season totals, ratings and standings are worked out again from the saved scores.</div></div>`;
  el.innerHTML=html;
}
// The courts a round was actually played on, taken from that round's own scores. This is the only honest source:
// the line-up a session STARTS with is not the line-up it plays, because a player can drop out and a spare be called
// in once the night is under way (Sam for Ivanka, 16 September).
function roundLineup(sess,cy){
  const a={};for(let c=1;c<=NC;c++)a[c]=[];
  Object.keys(sess.scores||{}).forEach(k=>{
    const m=k.match(/^c(\\d+)_y(\\d+)_g/);if(!m||+m[2]!==cy)return;
    const c=+m[1],sc=sess.scores[k];
    [sc.a1,sc.a2,sc.b1,sc.b2].forEach(id=>{if(id!=null&&!a[c].includes(id))a[c].push(id);});
  });
  return a;
}
// Replay the night: each round is ranked on the courts it was played on, and rotated, in order. As many rounds are
// replayed as were rotated before, so a correction never invents a round or drops one.
function replaySessionRotations(sess){
  const rounds=(sess.movements||[]).length;
  if(!rounds)return true;
  const lineups=[];
  for(let cy=1;cy<=rounds;cy++){
    const a=roundLineup(sess,cy);
    if(!Object.keys(a).some(c=>a[c].length))return false; // a rotated round with no scores cannot be ranked again
    lineups.push(a);
  }
  sess.movements=[];
  for(let cy=1;cy<=rounds;cy++){sess.assignments=lineups[cy-1];rotateSession(sess,cy);}
  return true;
}
async function saveScoreEdits(){
  if(!adminUnlocked)return toast('Organizer verification required','warn');
  const t=editableSession();if(!t)return toast('Nothing to edit','warn');
  const sess=t.sess,rounds=sessRounds(sess);
  const cy=rounds.includes(_edRound)?_edRound:rounds[rounds.length-1];
  const courts=sessCourtsIn(sess,cy),c=courts.includes(_edCourt)?_edCourt:courts[0];
  if(!cy||!c)return toast('Choose a round and a court','warn');
  const target=courtTarget(sessCourtSize(sess,cy,c));
  const edits={};let changed=0;
  for(const{g,sc}of sessGamesIn(sess,cy,c)){
    const sa=parseInt((document.getElementById(`ed_${g}_a`)||{}).value),sb=parseInt((document.getElementById(`ed_${g}_b`)||{}).value);
    const v=validScore(sa,sb,target);
    if(v.error)return toast(`Game ${g}: ${v.error}`,'warn');
    if(sa!==sc.sA||sb!==sc.sB)changed++;
    edits[`c${c}_y${cy}_g${g}`]={...sc,sA:sa,sB:sb,w:sa>sb?'A':'B'};
  }
  if(!changed)return toast('Nothing changed','info');
  const copy=JSON.parse(JSON.stringify(sess));
  Object.assign(copy.scores,edits);
  if(!replaySessionRotations(copy))return toast('A round that was worked out has no scores left to rank, so this session cannot be worked out again. Use Undo Last Round instead.','error');
  const btn=document.getElementById('ed-save');if(btn){btn.disabled=true;btn.textContent='Saving…';}
  try{
    if(t.live){
      await setKV('current_session',copy);
    }else{
      copy.finalAssignments=JSON.parse(JSON.stringify(copy.assignments)); // the courts the next session starts from
      const list=(S.sessions||[]).map(x=>x&&x.id===copy.id?copy:x);
      await setKV('completed_sessions',list);
      // No session is live, so the ladder follows the corrected result.
      for(let court=1;court<=NC;court++)for(const id of (copy.finalAssignments[court]||[])){
        const p=S.players.find(x=>x.id===id);
        if(p&&p.currentCourt!==court)await sbU('players',id,{current_court:court,highest_court:Math.min(p.highestCourt||court,court)});
      }
    }
    await rebuildStats();await loadAll();renderAll();
    toast(`Court ${c}, Round ${cy} corrected — the session was worked out again`,'success');
  }catch(e){
    const m=e&&e.message||'';
    if(/already has scores/.test(m))toast('The round being played already has scores on a court this would move. Undo Last Round first, then correct the score.','error');
    else if(e&&(e.code==='40001'||/Stale state/.test(m))){toast('The page was behind — reloading; try the correction again.','warn');await loadAll();renderAll();}
    else toast('Not saved: '+(m||'try again'),'error');
  }finally{const b=document.getElementById('ed-save');if(b){b.disabled=false;}renderScoreEdit();}
}
let _activeLoads=0;""")

# Keep it painted with the rest of the admin screens.
sub("""  if(adminUnlocked){renderAdminPlayers();renderRegPlayers();renderPastPlayers();renderWaiverAdmin();renderSessionAdmin();renderAttendanceTab();renderAssignUI();renderPayments();renderAnnouncementsAdmin();renderSnapshots();renderReminderTools();}""",
    """  if(adminUnlocked){renderAdminPlayers();renderRegPlayers();renderPastPlayers();renderWaiverAdmin();renderSessionAdmin();renderAttendanceTab();renderAssignUI();renderPayments();renderAnnouncementsAdmin();renderSnapshots();renderReminderTools();renderScoreEdit();} // p87""")

f.write_text(s)
print("p87 applied")
