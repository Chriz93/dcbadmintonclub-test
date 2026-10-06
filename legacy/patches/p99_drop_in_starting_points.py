# p99 (October 5, 2026): the organizer gives a drop-in their starting points and their starting court.
#  From the organizer: "if a drop in player comes, admin gets the right to assign him some points and give him a starting
#  court".
#  What was wrong: a player's starting rating was decided entirely by the court they first played on — 1500 on Court 1
#  down to 1000 on Court 6 — with no way to say otherwise. A strong drop-in seated on Court 5 therefore started 400
#  points below their level, and spent several nights beating people while their rating climbed out of a hole; a weaker
#  drop-in seated high started above theirs and handed points to everybody who beat them. The number was never the
#  organizer's to set, even though they are the only one who knows the player.
#  Now Admin → Assign carries one card: choose a player, type their starting points, pick the court they start on. The
#  points replace the court's own starting number for that player and nothing else — every game after that is scored the
#  same way for everybody, and the court is set through the usual seat change, so it is not counted as a court drop (p92).
#  Clearing the number puts them back on the court's own starting points.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# ── The stored numbers ────────────────────────────────────────────────────────────────────────────────────────────────
sub("""    draft.adminCourtMoves=await loadKV('admin_court_moves')||{}; // p92: courts the organizer moved by hand, not won""",
    """    draft.adminCourtMoves=await loadKV('admin_court_moves')||{}; // p92: courts the organizer moved by hand, not won
    draft.seedPoints=await loadKV('player_seed_points')||{}; // p99: starting points the organizer set for a drop-in""")

# ── The rating starts where the organizer says ────────────────────────────────────────────────────────────────────────
sub("""  Object.keys(firstCourt).forEach(id=>{if(elo[id]===undefined)elo[id]=1500-((firstCourt[id]-1)*100);});""",
    """  Object.keys(firstCourt).forEach(id=>{if(elo[id]===undefined)elo[id]=1500-((firstCourt[id]-1)*100);});
  // p99: a starting number the organizer set for a drop-in replaces the court's own, and only the start: every game
  // after it is scored exactly as it is for everybody else.
  Object.entries(S.seedPoints||{}).forEach(([id,v])=>{const n=Number(v);if(Number.isFinite(n))elo[id]=n;});""")

# ── The card on the Assign board ──────────────────────────────────────────────────────────────────────────────────────
sub("""  if(!S.current)html+=`<div class="alert alert-info" style="margin-bottom:10px;">Tonight's starting courts. Drag a player to another court, or out to <strong>Not playing</strong>. Each court lists its players by wins, then points scored — the player at the bottom is the one to move down. Moving somebody is your decision and is not counted as a court drop in their stats.</div>`;""",
    """  if(!S.current)html+=`<div class="alert alert-info" style="margin-bottom:10px;">Tonight's starting courts. Drag a player to another court, or out to <strong>Not playing</strong>. Each court lists its players by wins, then points scored — the player at the bottom is the one to move down. Moving somebody is your decision and is not counted as a court drop in their stats.</div>`;
  html+=dropInCard(); // p99""")

sub("""// Drag-and-drop handlers
let dragPid=null;""",
    """// p99: the starting points a drop-in plays from. The court a player first plays on decides this for everybody else
// (Court 1 is 1500, each court below is 100 less); for a player the organizer knows plays above or below that court,
// the organizer sets the number instead.
const ELO_SEED_MIN=800,ELO_SEED_MAX=2000;
function seedPointsOf(id){const n=Number((S.seedPoints||{})[id]);return Number.isFinite(n)?n:null;}
function courtStartPoints(p){const c=p&&p.currentCourt>0&&p.currentCourt<=NC?p.currentCourt:NC;return 1500-((c-1)*100);}
function dropInCard(){
  if(!adminUnlocked)return '';
  const pick=S.players.filter(p=>p.approved&&!p.waitlisted).sort((a,b)=>a.name.localeCompare(b.name));
  const set=Object.keys(S.seedPoints||{}).map(Number).map(id=>S.players.find(p=>p.id===id)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
  return `<div class="card" id="drop-in" style="margin-bottom:10px;border-color:var(--teal);">
    <div class="card-title" style="color:var(--teal2);">🎯 Drop-in or returning player</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.5;">A player with no season behind them starts from the court they first play on — Court 1 is 1500 points, each court below is 100 fewer. Set the number yourself when you know they play above or below that court, and give them the court to start on. Only the start changes: every game they play is scored like everybody else's, and the court you give them is not counted as a court drop.</div>
    <label class="lbl" for="di-player">Player</label>
    <select class="inp" id="di-player" onchange="dropInPick()">
      <option value="">— Choose —</option>
      ${pick.map(p=>`<option value="${p.id}">${esc(p.name)}${isSpareMember(p)?' (spare)':''} — ${p.currentCourt?'Court '+p.currentCourt:'no court'}${seedPointsOf(p.id)!==null?` · set to ${seedPointsOf(p.id)}`:''}</option>`).join('')}
    </select>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <div style="flex:1 1 130px;min-width:0;"><label class="lbl" for="di-points">Starting points</label><input class="inp" id="di-points" type="number" inputmode="numeric" min="${ELO_SEED_MIN}" max="${ELO_SEED_MAX}" step="1" placeholder="the court's own"></div>
      <div style="flex:1 1 130px;min-width:0;"><label class="lbl" for="di-court">Starting court</label><select class="inp" id="di-court">${[0,1,2,3,4,5,6].map(c=>`<option value="${c}">${c?'Court '+c:'No court'}</option>`).join('')}</select></div>
    </div>
    <button class="btn btn-primary btn-sm" id="di-save" onclick="saveDropIn()">Save starting points</button>
    ${set.length?`<div id="di-set" style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.8;">Set by you: ${set.map(p=>`${esc(p.name)} <strong style="color:var(--text);">${seedPointsOf(p.id)}</strong> <button class="btn btn-ghost btn-sm di-clear" data-pid="${p.id}" style="padding:1px 5px;font-size:10px;margin:0;" title="Put ${esc(p.name)} back on the court's own starting points" onclick="clearDropIn(${p.id})">✕</button>`).join(' · ')}</div>`:''}
  </div>`;
}
// Choosing a player fills the two boxes in with what they have now, so saving without typing changes nothing.
function dropInPick(){
  const pts=document.getElementById('di-points'),crt=document.getElementById('di-court');if(!pts||!crt)return;
  const p=S.players.find(x=>x.id===parseInt(document.getElementById('di-player')?.value||'0'));
  if(!p){pts.value='';pts.placeholder="the court's own";crt.value='0';return;}
  const seed=seedPointsOf(p.id);
  pts.value=seed===null?'':String(seed);
  pts.placeholder=`${courtStartPoints(p)} on Court ${p.currentCourt>0?p.currentCourt:NC}`;
  crt.value=String(p.currentCourt||0);
}
async function writeSeedPoints(id,pts){
  const seeds={...(S.seedPoints||{})};
  if(pts===null)delete seeds[id];else seeds[id]=pts;
  await setKV('player_seed_points',seeds);S.seedPoints=seeds;
}
async function saveDropIn(){
  if(!adminUnlocked)return toast('Organizer verification required','warn');
  const id=parseInt(document.getElementById('di-player')?.value||'0');
  const p=S.players.find(x=>x.id===id);if(!p)return toast('Choose a player','warn');
  const court=parseInt(document.getElementById('di-court')?.value||'0');
  if(!Number.isInteger(court)||court<0||court>NC)return toast('Choose a valid court','warn');
  const raw=String(document.getElementById('di-points')?.value||'').trim();
  let pts=null;
  if(raw!==''){
    pts=Number(raw);
    if(!Number.isFinite(pts))return toast('Starting points must be a number','warn');
    pts=Math.round(pts);
    if(pts<ELO_SEED_MIN||pts>ELO_SEED_MAX)return toast(`Starting points must be between ${ELO_SEED_MIN} and ${ELO_SEED_MAX}`,'warn');
  }
  if(pts!==seedPointsOf(id)){
    try{await writeSeedPoints(id,pts);}
    catch(e){await loadAll();renderAll();return toast('Starting points not saved: '+e.message,'error');}
  }
  const said=pts===null?`${p.name} starts on the court's own points`:`${p.name} starts on ${pts} points`;
  if(court!==p.currentCourt){await setPlayerCourt(id,court);toast(said,'success');return;}
  await loadAll();renderAll();toast(said+(court?` · Court ${court}`:''),'success');
}
async function clearDropIn(id){
  if(!adminUnlocked)return toast('Organizer verification required','warn');
  const p=S.players.find(x=>x.id===id);if(!p)return;
  try{await writeSeedPoints(id,null);}
  catch(e){await loadAll();renderAll();return toast('Starting points not cleared: '+e.message,'error');}
  await loadAll();renderAll();toast(`${p.name} is back on the court's own starting points (${courtStartPoints(p)})`,'success');
}
// Drag-and-drop handlers
let dragPid=null;""")

sub(""""promoteFromWaitlist":"Promote from waitlist","saveEditRegistration":"Edit registration"};""",
    """"promoteFromWaitlist":"Promote from waitlist","saveEditRegistration":"Edit registration","saveDropIn":"Starting points","clearDropIn":"Starting points"};""")

f.write_text(s)
print("p99 applied")
