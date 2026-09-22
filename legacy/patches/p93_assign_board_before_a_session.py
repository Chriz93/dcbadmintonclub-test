# p93 (September 22, 2026): the drag-and-drop court board works before a session, and shows what the organizer picks on.
#  From the organizer: "dont I have the flexibility of moving players from one court to another? ... Is this the right
#  place to do the court assignments? do a deep check" — and, asked directly, "Yes — enable drag-and-drop before a
#  session", plus how they choose who goes down: "I move a player down based on thier wins, if wins tie then look at
#  the points scored not ELO".
#  What was wrong: Admin → Assign refused to work until a session had started ("Start a session first to drag-and-drop
#  players between courts"), so the only way to arrange tonight's courts was the Courts tab's panel — two dialogs deep,
#  one player at a time, with the whole line-up recomputed and the dialog closed after every single move. That is why
#  arranging courts for a strong spare felt like fighting the app.
#  Now the same board arranges tonight's starting courts: drag a player from court to court, or out to Not playing.
#  Every player chip carries the two numbers the organizer decides on — wins this season, then points scored — and each
#  court lists its players in that order, so the one to move down is the one at the bottom. Elo is deliberately not
#  shown here: it is not what this decision is made on.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# Wins and points scored across the season, from the games themselves.
sub("""function courtLock(){""",
    """// p93: every player's season so far, taken from the games played: wins, losses and the points they scored. The
// organizer picks who moves down on wins, then points — never on rating — so those are the numbers the board shows.
let _seasonRecCache=null,_seasonRecKey='';
function seasonRecord(){
  const sess=[...(S.sessions||[]),...(S.current?[S.current]:[])].filter(Boolean);
  const key=sess.map(x=>`${x.id}:${Object.keys(x.scores||{}).length}`).join('|');
  if(_seasonRecCache&&_seasonRecKey===key)return _seasonRecCache;
  const rec={};
  const bump=id=>{if(!rec[id])rec[id]={w:0,l:0,gp:0,pts:0};return rec[id];};
  sess.forEach(x=>Object.values(x.scores||{}).forEach(sc=>{
    if(!sc||(sc.w!=='A'&&sc.w!=='B'))return;
    const A=[sc.a1,sc.a2].filter(v=>v!=null),B=[sc.b1,sc.b2].filter(v=>v!=null);
    A.forEach(id=>{const r=bump(id);r.gp++;r.pts+=sc.sA||0;if(sc.w==='A')r.w++;else r.l++;});
    B.forEach(id=>{const r=bump(id);r.gp++;r.pts+=sc.sB||0;if(sc.w==='B')r.w++;else r.l++;});
  }));
  _seasonRecCache=rec;_seasonRecKey=key;return rec;
}
// The organizer's own order: most wins first, then most points scored. The player at the bottom is the one to move.
function byWinsThenPoints(ids,rec){
  return [...ids].sort((x,y)=>{const a=rec[x]||{w:0,pts:0},b=rec[y]||{w:0,pts:0};
    return (b.w||0)-(a.w||0)||(b.pts||0)-(a.pts||0)||x-y;});
}
// One move, whichever screen it came from: during a session it changes tonight's courts, before one it sets the court.
async function assignMove(id,court){
  if(S.current)return moveCourtPlayer(id,court);
  if(!court)return removeFromUpcoming(id); // taking a player out before a session means they are not coming
  return setPlayerCourt(id,court);
}
function courtLock(){""")

# The board itself, before a session as well as during one.
sub("""  if(!S.current){el.innerHTML='<div class="alert alert-warn">Start a session first to drag-and-drop players between courts.</div>';return;}
  const a=S.current.assignments;let html='';""",
    """  // p93: before a session the board arranges tonight's starting courts; during one it arranges the live courts.
  const a=S.current?S.current.assignments:upcomingLineup().assign;let html='';
  if(!S.current)html+=`<div class="alert alert-info" style="margin-bottom:10px;">Tonight's starting courts. Drag a player to another court, or out to <strong>Not playing</strong>. Each court lists its players by wins, then points scored — the player at the bottom is the one to move down. Moving somebody is your decision and is not counted as a court drop in their stats.</div>`;""")

sub("""  const unassigned=S.players.filter(p=>!assignedSet.has(p.id));""",
    """  // p93: before a session, the pool is everyone approved who is not in tonight's line-up.
  const unassigned=S.current?S.players.filter(p=>!assignedSet.has(p.id))
    :S.players.filter(p=>p.approved&&!p.waitlisted&&!assignedSet.has(p.id));
  const _rec=seasonRecord(); // p93
  const _chip=(p,c)=>{const r=_rec[p.id]||{w:0,l:0,pts:0};
    return `<div class="dnd-player" draggable="true" data-pid="${p.id}" ondragstart="dndStart(event,${p.id})">${esc(p.name)}${p.membershipType==='spare'?'<span class="spare-badge" style="margin-left:4px;">S</span>':''}`
      +`<span class="dnd-rec" style="margin-left:6px;font-size:10px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;">${r.w}W · ${r.pts} pts</span>`
      +`<select class="inp" aria-label="Move ${esc(p.name)}"${courtLock()} onchange="assignMove(${p.id},Number(this.value))"><option value="0">${S.current?'Unassigned':'Not playing'}</option>${[1,2,3,4,5,6].map(t=>`<option value="${t}" ${t===c?'selected':''}>Court ${t}</option>`).join('')}</select></div>`;};""")

sub("""      <div class="dnd-court-hdr"><span class="dnd-court-title" style="color:var(--yellow2);">UNASSIGNED</span><span class="dnd-court-cnt" style="background:rgba(243,156,18,0.15);color:var(--yellow2);">${unassigned.length}</span></div>
      <div class="dnd-slots">${unassigned.map(p=>`<div class="dnd-player" draggable="true" data-pid="${p.id}" ondragstart="dndStart(event,${p.id})">${esc(p.name)}<select class="inp" aria-label="Move ${esc(p.name)}"${courtLock()} onchange="moveCourtPlayer(${p.id},Number(this.value))"><option value="0">Unassigned</option>${[1,2,3,4,5,6].map(c=>`<option value="${c}">Court ${c}</option>`).join('')}</select></div>`).join('')}</div>""",
    """      <div class="dnd-court-hdr"><span class="dnd-court-title" style="color:var(--yellow2);">${S.current?'UNASSIGNED':'NOT PLAYING'}</span><span class="dnd-court-cnt" style="background:rgba(243,156,18,0.15);color:var(--yellow2);">${unassigned.length}</span></div>
      <div class="dnd-slots">${unassigned.map(p=>_chip(p,0)).join('')}</div>""")

sub("""    const pids=(a[c]||[]);
    const players=pids.map(id=>S.players.find(p=>p.id===id)).filter(Boolean);""",
    """    // p93: before a session the court is listed in the order the organizer decides on — most wins, then most points,
    // so the player to move down is last. During a session the court keeps the order the night put it in.
    const pids=S.current?(a[c]||[]):byWinsThenPoints(a[c]||[],_rec);
    const players=pids.map(id=>S.players.find(p=>p.id===id)).filter(Boolean);""")

sub("""        ${players.map(p=>`<div class="dnd-player" draggable="true" data-pid="${p.id}" ondragstart="dndStart(event,${p.id})">${esc(p.name)}${p.membershipType==='spare'?'<span class="spare-badge" style="margin-left:4px;">S</span>':''}<select class="inp" aria-label="Move ${esc(p.name)}"${courtLock()} onchange="moveCourtPlayer(${p.id},Number(this.value))"><option value="0">Unassigned</option>${[1,2,3,4,5,6].map(t=>`<option value="${t}" ${t===c?'selected':''}>Court ${t}</option>`).join('')}</select></div>`).join('')}""",
    """        ${players.map(p=>_chip(p,c)).join('')}""")

# A drop uses the same one move.
sub("""async function dndDrop(e,targetCourt){e.preventDefault();e.currentTarget.classList.remove('drag-over');const id=dragPid;dragPid=null;if(id)await moveCourtPlayer(id,targetCourt);}""",
    """async function dndDrop(e,targetCourt){e.preventDefault();e.currentTarget.classList.remove('drag-over');const id=dragPid;dragPid=null;if(id)await assignMove(id,targetCourt);} // p93""")

f.write_text(s)
print("p93 applied")
