# p86 (September 20, 2026), part one of the score editor: one rotation, usable on any session.
#  The rotation was written against S.current: it read S.current.cycle, S.current.assignments, S.current.scores and
#  S.current.movements directly, and the coin toss was seeded from S.current.id. Correcting a score in a session that
#  has already rotated means working the rotation out again from the corrected score — including for a session that is
#  no longer the live one — so the rotation now takes the session it is working on as an argument.
#  Nothing about the result changes for a live round: applyRotation() is the same call with S.current passed in, and
#  the toss is seeded from the same session id, so a replayed toss lands exactly where the original did.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# The toss is seeded by the session it belongs to, so replaying an old session draws that session's toss again.
sub("""function tossOrder(ids,cy,c){
  const g=[...ids].sort((x,y)=>x-y);let h=2166136261;
  for(const ch of `${S.current?.id||0}|${cy}|${c}|${g.join(',')}`){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}""",
    """function tossOrder(ids,cy,c,sessId){ // p86: sessId keeps a replayed toss identical to the one first drawn
  const g=[...ids].sort((x,y)=>x-y);let h=2166136261;
  for(const ch of `${sessId??S.current?.id??0}|${cy}|${c}|${g.join(',')}`){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}""")
sub("""function sortCourtRanking(pids,wins,pts,ptFor,ptAgainst,cy,c,preTosses){""",
    """function sortCourtRanking(pids,wins,pts,ptFor,ptAgainst,cy,c,preTosses,sessId){ // p86: sessId seeds the toss""")
sub("""  if(topG.length>1){const w=topT&&topG.includes(topT.winnerId)?topT.winnerId:tossOrder(topG,cy,c)[0];sorted.splice(sorted.indexOf(w),1);sorted.unshift(w);}
  if(botG.length>1){const l=botT&&botG.includes(botT.loserId)&&botT.loserId!==sorted[0]?botT.loserId:tossOrder(botG,cy,c).filter(id=>id!==sorted[0]).slice(-1)[0];sorted.splice(sorted.indexOf(l),1);sorted.push(l);}""",
    """  if(topG.length>1){const w=topT&&topG.includes(topT.winnerId)?topT.winnerId:tossOrder(topG,cy,c,sessId)[0];sorted.splice(sorted.indexOf(w),1);sorted.unshift(w);}
  if(botG.length>1){const l=botT&&botG.includes(botT.loserId)&&botT.loserId!==sorted[0]?botT.loserId:tossOrder(botG,cy,c,sessId).filter(id=>id!==sorted[0]).slice(-1)[0];sorted.splice(sorted.indexOf(l),1);sorted.push(l);}""")

# The rotation itself, taking the session and the round it is rotating.
sub("""async function applyRotation(){
  const cy=S.current.cycle,a=S.current.assignments,wins={},pts={},ptFor={},ptAgainst={},gamesPlayedCycle={};
  activePlayers().forEach(p=>{wins[p.id]=0;pts[p.id]=0;ptFor[p.id]=0;ptAgainst[p.id]=0;gamesPlayedCycle[p.id]=0;});
  for(let c=1;c<=NC;c++)for(let g=1;g<=MAXG;g++){
    const sc=S.current.scores[`c${c}_y${cy}_g${g}`];if(!sc)continue;""",
    """// p86: the live round's rotation is this same rotation, applied to the session that is live.
async function applyRotation(){return rotateSession(S.current,S.current.cycle);}
// Rank every court of one round of one session, move the top and bottom players, and record what was decided.
// Mutates sess.assignments and appends to sess.movements — exactly what the live rotation has always done.
function rotateSession(sess,cy){
  const a=sess.assignments,wins={},pts={},ptFor={},ptAgainst={},gamesPlayedCycle={};
  // Start everyone who could appear in this round's record at zero, so a player who won nothing reads 0 and not
  // "nothing" — the round summary and the cards read these maps directly.
  const zero=id=>{wins[id]=wins[id]||0;pts[id]=pts[id]||0;ptFor[id]=ptFor[id]||0;ptAgainst[id]=ptAgainst[id]||0;gamesPlayedCycle[id]=gamesPlayedCycle[id]||0;};
  activePlayers().forEach(p=>zero(p.id));
  for(let c=1;c<=NC;c++)(a[c]||[]).forEach(zero); // a replayed session's players need not be on today's roster
  for(let c=1;c<=NC;c++)for(let g=1;g<=MAXG;g++){
    const sc=sess.scores[`c${c}_y${cy}_g${g}`];if(!sc)continue;""")
sub("""    const sorted=sortCourtRanking(pids,wins,pts,ptFor,ptAgainst,cy,c,S.current.preTosses);
    const up=courtAbove(c,a)?sorted[0]:null,down=courtBelow(c,a)?sorted[sorted.length-1]:null;""",
    """    const sorted=sortCourtRanking(pids,wins,pts,ptFor,ptAgainst,cy,c,sess.preTosses,sess.id);
    const up=courtAbove(c,a)?sorted[0]:null,down=courtBelow(c,a)?sorted[sorted.length-1]:null;""")
sub("""  S.current.assignments=na;
  S.current.movements.push({cycle:cy,mv,wins:{...wins},pts:{...pts},tosses:tossResults,tossChoices});
  // Clear consumed pre-toss records — next round starts fresh
  if(S.current.preTosses){
    Object.keys(S.current.preTosses).forEach(k=>{if(k.startsWith(`${cy}_`))delete S.current.preTosses[k];});
  }""",
    """  sess.assignments=na;
  sess.movements=sess.movements||[];
  sess.movements.push({cycle:cy,mv,wins:{...wins},pts:{...pts},tosses:tossResults,tossChoices});
  // Clear consumed pre-toss records — next round starts fresh
  if(sess.preTosses){
    Object.keys(sess.preTosses).forEach(k=>{if(k.startsWith(`${cy}_`))delete sess.preTosses[k];});
  }""")

f.write_text(s)
print("p86 applied")
