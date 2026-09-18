# p80 (September 18, 2026), from the organizer: "break the tie by head-to-head or total points".
#  Player of the Session is wins × a court bonus + half the win rate. Two players with the same record on the same
#  court tie on every part of it (Cindy and Allon, both 4–2 on Court 2, session 1). p79 fell back to a stable order;
#  now the night itself decides:
#    1. head to head — of the games the tied players played against each other, who won more;
#    2. then the points they scored across the night (every game they played, their side's score);
#    3. then the lower id, so the banner never changes on a redraw.
#  Head to head is counted only within the tied group, so the order stays consistent however many are level.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""  // p79: level on the weighted score? the better win rate takes it, then the higher court, then the lower id so the
  // banner is the same on every redraw.
  const rate=id=>(playerWins[id]||0)/(playerGames[id]||1);
  const best=Object.entries(weighted).sort((a,b)=>b[1]-a[1]||rate(b[0])-rate(a[0])||(playerCourt[a[0]]||NC)-(playerCourt[b[0]]||NC)||a[0]-b[0])[0];""",
    """  // p79/p80: level on the weighted score? the better win rate takes it, then the higher court; and if they are level
  // on all three, the night decides — head to head first, then the points they scored, then the lower id.
  const rate=id=>(playerWins[id]||0)/(playerGames[id]||1);
  const tieKey=id=>`${weighted[id].toFixed(6)}|${rate(id).toFixed(6)}|${playerCourt[id]||NC}`;
  const ordered=Object.keys(weighted).map(Number)
    .sort((a,b)=>weighted[b]-weighted[a]||rate(b)-rate(a)||(playerCourt[a]||NC)-(playerCourt[b]||NC)||a-b);
  const topKey=ordered.length?tieKey(ordered[0]):'';
  const tied=ordered.filter(id=>tieKey(id)===topKey);
  let bestId=ordered[0];
  if(tied.length>1){
    const group=new Set(tied);
    // Head to head: games the tied players played against each other, and the points each scored all night.
    const h2h={},points={};
    tied.forEach(id=>{h2h[id]=0;points[id]=0;});
    Object.values(sess.scores||{}).forEach(sc=>{
      const A=[sc.a1,sc.a2].filter(x=>x!=null),B=[sc.b1,sc.b2].filter(x=>x!=null);
      A.forEach(id=>{if(group.has(id))points[id]+=sc.sA;});
      B.forEach(id=>{if(group.has(id))points[id]+=sc.sB;});
      const ga=A.filter(id=>group.has(id)),gb=B.filter(id=>group.has(id));
      if(!ga.length||!gb.length)return;                       // only when tied players faced each other
      (sc.w==='A'?ga:gb).forEach(id=>{h2h[id]++;});
      (sc.w==='A'?gb:ga).forEach(id=>{h2h[id]--;});
    });
    bestId=[...tied].sort((a,b)=>h2h[b]-h2h[a]||points[b]-points[a]||a-b)[0];
  }
  const best=[String(bestId),weighted[bestId]];""")

f.write_text(s)
print("p80 applied")
