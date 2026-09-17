# p74 (September 16, 2026): after the last round the cards say what actually happened, and there is no Round 3.
#  From the organizer, after entering both rounds: "there is no round 3, and your round 3 projection itself is wrong …
#  why there is down arrow for GARY? … round 2 courts has to be named correctly, like after Round 2, the projected
#  court movement for next session … the court movements has to be clear, C2 -> C1 with green arrow etc, the top
#  courts top scorer gets crown cap to indicate they are top, and bottom group something else".
#  What was wrong: when the last round's rotation is applied, S.current.assignments already hold the NEXT session's
#  courts. The round cards kept computing "Round N" from those new courts, so they ranked next session's line-up
#  against last round's scores — arrows on players who stayed (Gary), a meaningless "Stay", and a projected Round 3
#  built by rotating once more. The movements the app recorded and applied were right all along (Completed Rounds).
#  Now: a finished round is read from the scores of that round (the players who actually played it), a night is two
#  rounds so nothing beyond the last is projected, the current-courts card says it holds the next session's courts,
#  and every move reads "C2 → C1" with the court's top marked 👑 and its bottom 🔻.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# 1. The players who actually played a round come from that round's scores, not from courts that have since rotated.
sub("""function computeRoundStatus(){""",
    """// p74: who actually played court `c` in round `cy` — taken from that round's own scores, because once the last
// round's rotation is applied S.current.assignments already hold the next session's courts. Falls back to the courts
// while a round is still being played (a five-player court rests one player per game, so only a finished round's
// scores name everyone).
function roundCourtPlayers(c,cy){
  const ids=[];
  for(let g=1;g<=MAXG;g++){
    const sc=S.current?.scores?.[`c${c}_y${cy}_g${g}`];if(!sc)continue;
    [sc.a1,sc.a2,sc.b1,sc.b2].forEach(id=>{if(id!=null&&!ids.includes(id))ids.push(id);});
  }
  return ids.length?ids:[...(S.current?.assignments?.[c]||[])];
}
// p74: the court a player played on in round `cy` (0 when they did not play it).
function courtInRound(id,cy){for(let c=1;c<=NC;c++)if(roundCourtPlayers(c,cy).includes(id))return c;return 0;}
// p74: the top and bottom of a court in a finished round, by the same ranking the movements used.
function roundStatusFor(cy,c){
  if(!c||!S.current)return{top:null,bottom:null};
  const pids=roundCourtPlayers(c,cy);if(pids.length<2)return{top:null,bottom:null};
  const wins={},pts={},ptFor={},ptAgainst={};
  pids.forEach(id=>{wins[id]=0;pts[id]=0;ptFor[id]=0;ptAgainst[id]=0;});
  for(let g=1;g<=MAXG;g++){
    const sc=S.current.scores[`c${c}_y${cy}_g${g}`];if(!sc)continue;
    const A=[sc.a1,sc.a2].filter(x=>x!=null),B=[sc.b1,sc.b2].filter(x=>x!=null);
    if(sc.w==='A')A.forEach(id=>{wins[id]=(wins[id]||0)+1;});else if(sc.w==='B')B.forEach(id=>{wins[id]=(wins[id]||0)+1;});
    A.forEach(id=>{pts[id]=(pts[id]||0)+sc.sA;ptFor[id]=(ptFor[id]||0)+sc.sA;ptAgainst[id]=(ptAgainst[id]||0)+sc.sB;});
    B.forEach(id=>{pts[id]=(pts[id]||0)+sc.sB;ptFor[id]=(ptFor[id]||0)+sc.sB;ptAgainst[id]=(ptAgainst[id]||0)+sc.sA;});
  }
  const sorted=sortCourtRanking(pids,wins,pts,ptFor,ptAgainst,cy,c,S.current.preTosses);
  return{top:sorted[0],bottom:sorted[sorted.length-1]};
}
function computeRoundStatus(){""")
sub("""    const pids=(a[c]||[]).filter(id=>S.players.find(p=>p.id===id));
    if(pids.length<2){courts[c]={scored:false,players:0,skip:true,courtCycle:cy};continue;}""",
    """    const pids=(S.current.completed?roundCourtPlayers(c,cy):(a[c]||[])).filter(id=>S.players.find(p=>p.id===id)); // p74
    if(pids.length<2){courts[c]={scored:false,players:0,skip:true,courtCycle:cy};continue;}""")

# 2. A night is two rounds: once the last one is finished there is no next round to project.
sub("""  let projectedAssignments=null;
  if(totalScored===totalCourts&&totalCourts>0){""",
    """  let projectedAssignments=null;
  if(!S.current.completed&&cy<MAX_ROUNDS_PER_SESSION&&totalScored===totalCourts&&totalCourts>0){ // p74: nothing beyond the last round""")

# 3. The courts card says what it is holding: the round being played, or the next session's courts once the night is done.
sub("""    <div class="card-title">🏸 Round ${cy} Courts</div>""",
    """    <div class="card-title">${S.current.completed?`🏸 After Round ${cy} — next session's courts`:`🏸 Round ${cy} Courts`}</div>""")
# and every move reads "C2 → C1", with the finished round's top and bottom marked.
sub("""      ${pids.map(p=>{
        // Show movement arrow from previous round if available
        const lastMv=S.current.movements.length>0?S.current.movements[S.current.movements.length-1]:null;
        const mv=lastMv?.mv?.[p.id];
        const arrow=mv==='up'?'<span style="color:var(--green2);"> ↑</span>':mv==='down'?'<span style="color:var(--red2);"> ↓</span>':'';
        return `<div style="font-size:10px;padding:1px 0;">${esc(p.name.split(' ')[0])}${arrow}</div>`;
      }).join('')}""",
    """      ${pids.map(p=>{
        // p74: where they came from and where they went — "C2 → C1" with the round's top 👑 and bottom 🔻.
        const lastMv=S.current.movements.length>0?S.current.movements[S.current.movements.length-1]:null;
        const mv=lastMv?.mv?.[p.id],from=lastMv?courtInRound(p.id,lastMv.cycle):0;
        const mark=lastMv&&roundStatusFor(lastMv.cycle,from).top===p.id?' 👑':lastMv&&roundStatusFor(lastMv.cycle,from).bottom===p.id?' 🔻':'';
        const move=mv==='up'&&from?`<span style="color:var(--green2);font-weight:700;"> C${from} → C${c} ↑</span>`
          :mv==='down'&&from?`<span style="color:var(--red2);font-weight:700;"> C${from} → C${c} ↓</span>`:'';
        return `<div style="font-size:10px;padding:1px 0;">${esc(p.name.split(' ')[0])}${mark}${move}</div>`;
      }).join('')}""")

# 4. The progress card is a result once the round is over, and marks the court's top and bottom plainly.
sub("""    <div class="card-title">📊 Round ${cy} Progress</div>""",
    """    <div class="card-title">${S.current.completed?`📊 Round ${cy} result`:`📊 Round ${cy} Progress`}</div>""")
sub("""      ${done&&winnerP?`<div style="font-size:11px;margin-top:3px;">${c>1?`<span style="color:var(--green2);">↑${esc(winnerP.name.split(' ')[0])}</span>`:`<span style="color:var(--muted);">👑${esc(winnerP.name.split(' ')[0])}</span>`}</div>`:''}
      ${done&&loserP?`<div style="font-size:11px;">${hasPlayersBelow(c)?`<span style="color:var(--red2);">↓${esc(loserP.name.split(' ')[0])}</span>`:`<span style="color:var(--muted);">⬇️Stay</span>`}</div>`:''}""",
    """      ${done&&winnerP?`<div style="font-size:11px;margin-top:3px;"><span style="color:${c>1?'var(--green2)':'var(--muted)'};">👑${esc(winnerP.name.split(' ')[0])}${c>1?` C${c} → C${c-1} ↑`:' stays on the top court'}</span></div>`:''}
      ${done&&loserP?`<div style="font-size:11px;"><span style="color:${hasPlayersBelow(c)?'var(--red2)':'var(--muted)'};">🔻${esc(loserP.name.split(' ')[0])}${hasPlayersBelow(c)?` C${c} → C${c+1} ↓`:' stays on the bottom court'}</span></div>`:''}""")

f.write_text(s)
print("p74 applied")
