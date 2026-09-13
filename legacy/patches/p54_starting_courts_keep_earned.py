# p54 (September 13, 2026): tonight's starting courts keep everyone on the court they earned.
#  - Before: the lineup shown on the Courts page before the session (and seated by Start Session) re-ranked everyone who
#    was coming, four to a court. One decline moved every player below it up a court, so the Courts page disagreed with
#    Admin → Players (found by the organizer on TEST: Court 6's three players showed on Court 5 and two spares on Court 6).
#    The WhatsApp share used a third lineup: earned courts, including players who had declined, and no spares.
#  - Now one rule, used by the Courts page, the court details, the WhatsApp share and Start Session:
#      1. everyone who is coming keeps the court they earned; nobody moves up for a player who is not coming;
#      2. confirmed spares take open seats from the bottom court up (a short court first, then a fifth seat from the
#         bottom once every court in use has four);
#      3. the court-adjustment engine then settles a court left with one player or more than five, exactly as at the
#         gym; if it cannot, Start Session is refused with the reason.
#    Before the session the Courts page lists what differs from the earned courts. The organizer's explicit
#    "Re-sort & Rebalance" still re-ranks everyone four to a court (that is what it is for).
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""  const confirmedSpares=spareSeats().claims.filter(c=>c.confirmed).map(c=>c.id).filter(id=>!preAbsent.has(id));
  return{votes,pre,declined,preAbsent,confirmedSpares,assign:autoAssign(new Set([...declined,...preAbsent]),confirmedSpares)};
}""", """  const confirmedSpares=spareSeats().claims.filter(c=>c.confirmed).map(c=>c.id).filter(id=>!preAbsent.has(id));
  const assign=autoAssign(new Set([...declined,...preAbsent]),confirmedSpares),nm=id=>S.players.find(p=>p.id===id)?.name||'Player';
  const off=S.players.filter(p=>p.currentCourt>0&&!isSpareMember(p)&&(declined.has(p.id)||preAbsent.has(p.id))).sort((a,b)=>a.currentCourt-b.currentCourt||a.id-b.id)
    .map(p=>`${nm(p.id)} ${preAbsent.has(p.id)?'is marked absent':'is not coming'} (Court ${p.currentCourt}).`);
  return{votes,pre,declined,preAbsent,confirmedSpares,assign,notes:[...off,..._lineupNotes],problem:_lineupProblem};
}""")
sub("""  const{votes,pre,declined,preAbsent,confirmedSpares,assign:initAssign}=upcomingLineup();
  {const why=seatingProblem(Object.values(initAssign).flat().length);if(why)return toast(why,'error');}""",
    """  const{votes,pre,declined,preAbsent,confirmedSpares,assign:initAssign,problem}=upcomingLineup();
  {const why=seatingProblem(Object.values(initAssign).flat().length)||problem;if(why)return toast(why,'error');}""")
sub("""// Regulars in order of earned court (spares only when confirmed for the night), four per court, the rest on Court 6.
// More players than six courts seat (five each) is not a valid night: say so instead of overfilling a court.""",
    """// More players than six courts seat (five each) is not a valid night: say so instead of overfilling a court.""")
sub("""function autoAssign(exclude=new Set(),spares=[]){
  const a={};for(let c=1;c<=NC;c++)a[c]=[];
  const regulars=activePlayers().filter(p=>p.membershipType!=='spare'&&!exclude.has(p.id));
  const extra=spares.map(id=>S.players.find(p=>p.id===id)).filter(p=>p&&!regulars.includes(p));
  const key=p=>p.currentCourt>0&&p.membershipType!=='spare'?p.currentCourt:NC+1;
  const sorted=[...regulars,...extra].sort((x,y)=>key(x)-key(y));
  Object.assign(a,fillCourts(sorted.map(p=>p.id)));
  return a;
}""", """// Tonight's starting courts (p54): everyone who is coming keeps the court they earned; nobody moves up for a player who
// is not coming. Confirmed spares take open seats from the bottom court up (a short court first, then a fifth seat from
// the bottom). The court-adjustment engine then settles a court left with one player or more than five, as at the gym.
// _lineupNotes says what differs from the earned courts; _lineupProblem is set when no valid lineup exists.
let _lineupNotes=[],_lineupProblem='';
function autoAssign(exclude=new Set(),spares=[]){
  const L={};for(let c=1;c<=NC;c++)L[c]=[];
  const nm=id=>S.players.find(p=>p.id===id)?.name||'Player',notes=[];
  activePlayers().filter(p=>p.membershipType!=='spare'&&!exclude.has(p.id)).forEach(p=>L[Math.min(NC,Math.max(1,p.currentCourt))].push(p.id));
  for(const id of spares){
    if(!S.players.some(p=>p.id===id)||Object.values(L).some(ids=>ids.includes(id)))continue;
    const used=[...Array(NC).keys()].map(i=>NC-i).filter(c=>L[c].length);
    const c=used.find(x=>L[x].length<4)||used.find(x=>L[x].length<5)||used[0]||NC;
    L[c].push(id);notes.push(`${nm(id)} (spare) takes an open seat on Court ${c}.`);
  }
  const res=adjustCourts({nc:NC,lineup:L,names:Object.fromEntries(S.players.map(p=>[p.id,p.name])),locked:[],closed:[],absent:[],returning:[],late:[]});
  _lineupProblem=res.ok?'':res.problem;
  if(res.ok)for(const m of res.moves)notes.push(m.reason==='full'?`Court ${m.from} would have more than five players, so ${nm(m.id)} starts on Court ${m.to}.`
    :m.reason==='alone-up'?`${nm(m.id)} would be the only player on Court ${m.from}, the bottom court in use, so starts on Court ${m.to} above.`
    :`${nm(m.id)} would be the only player on Court ${m.from}, so starts on Court ${m.to}.`);
  _lineupNotes=notes;
  const A=res.ok?res.lineup:L,out={};for(let c=1;c<=NC;c++)out[c]=[...(A[c]||[])];
  return out;
}""")
sub("""  // When no session: show next session's lineup from the votes (what Start Session will seat).
  const assignments=S.current?S.current.assignments:upcomingLineup().assign;""",
    """  // When no session: tonight's starting courts from the votes (exactly what Start Session will seat), and what differs
  // from the earned courts shown in Admin → Players.
  const up=S.current?null:upcomingLineup();
  const assignments=S.current?S.current.assignments:up.assign;
  {const gvEl=document.getElementById('court-gym-view');let ln=document.getElementById('lineup-notes');
   if(gvEl&&!ln){ln=document.createElement('div');ln.id='lineup-notes';gvEl.parentNode.insertBefore(ln,gvEl);}
   if(ln)ln.innerHTML=up&&(up.notes.length||up.problem)?`<div class="card" style="margin-bottom:10px;"><div class="card-title">Tonight's starting courts</div>
     <p style="font-size:13px;margin:0 0 6px;">Everyone keeps the court they earned. Nobody moves up for a player who is not coming.</p>
     ${up.problem?`<div class="alert alert-error" role="alert">${esc(up.problem)}</div>`:''}
     ${up.notes.length?`<ul class="adj-list" id="lineup-notes-list">${up.notes.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:''}</div>`:'';}""")
sub("""  let assignments;if(S.current){assignments=S.current.assignments;}else{assignments={};for(let c=1;c<=NC;c++)assignments[c]=[];activePlayers().forEach(p=>{if(p.currentCourt>=1&&p.currentCourt<=NC)assignments[p.currentCourt].push(p.id);});}""",
    """  const assignments=S.current?S.current.assignments:upcomingLineup().assign;   // the same starting courts as the Courts page""")
sub("""      // Max 4 per court
      Object.values(aa1).every(ids=>ids.length<=4)?P('AA2:max4'):F('AA2:max4','over');
      // Courts filled in order (court 1 first)
      Object.values(aa1)[0].length>=Object.values(aa1)[5].length?P('AA2:fillOrder'):F('AA2:fillOrder','wrong');""",
    """      // No court over five, and nobody alone on a court (p54: everyone keeps the court they earned)
      Object.values(aa1).every(ids=>ids.length<=5)?P('AA2:max5'):F('AA2:max5','over');
      Object.values(aa1).every(ids=>ids.length!==1)?P('AA2:noLone'):F('AA2:noLone','a court with one player');""")
f.write_text(s)
print("p54 applied")
