# p106 (October 6, 2026): where a player stands is the rating they have EARNED this season, not the rating they hold.
#  p105 ordered each court by the rating. Run against the league's own data (production backup, 4 October, three sessions
#  played) that turns out to be wrong in a way that would have been obvious on the night:
#      Court 1 by rating: Glen 1527, Jagjot 1507, Christy 1503, Gary 1459, Allon 1432 — so ALLON, with 12 wins from 18,
#      the joint best record on the court, is the player it sends down. Court 2: RYAN, with 10 wins, the most on the
#      court, comes last of five.
#  Why: a rating starts from the court a player FIRST played on — 1500 on Court 1, 100 fewer for each court below — and
#  after three sessions nobody has moved more than about 40 points from where they started. The courts are 100 apart. So
#  the rating today reports which court somebody began on far more loudly than how they have played, and ordering a court
#  by it sends down precisely the players who won their way up onto it.
#  Now each court is ordered by the rating a player has earned — their rating minus the number they started from — which
#  measures play and nothing else. It keeps every property the rating was chosen for: it does not move when a player
#  misses a night, it is bounded (a round moves it by at most 32, so one night cannot vault anyone), it accounts for who
#  they beat, and the no-show penalty feeds straight into it. On the same data it gives Court 1: Allon +32, Glen +27,
#  Jagjot +7, Christy +3, Gary −41 — the order anybody at the gym would have written down.
#  Where a drop-in's starting points were set by hand (p99), that number is what they started from, so they too begin at
#  nothing earned. Players level on what they have earned are separated by the court they started from, then by wins per
#  game, then by the lowest id, so the answer is the same every time.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# ── The number a player starts the season from, on its own ────────────────────────────────────────────────────────────
sub("""function computeEloRatings(sessList,applyCount){ // p84: applyCount limits the rounds played, never the seeding
  // Start from the court each player first played on this season: 1500 on Court 1 down to 1000 on Court 6.
  // Players who have not played yet start from their current court. (Seeding from the peak court instead would hand
  // every climber a retroactive +100 on top of the rating they earned by winning.)
  const elo={};
  const seasonSess=(sessList?[...sessList]:[...(S.sessions||[]),...(S.current?[S.current]:[])]).filter(Boolean); // p76
  const firstCourt={};
  seasonSess.forEach(sess=>{
    Object.keys(sess.scores||{}).map(k=>{const m=k.match(/^c(\\d+)_y(\\d+)_g/);return m?{k,c:+m[1],y:+m[2]}:null;}).filter(Boolean)
      .sort((a,b)=>a.y-b.y||a.c-b.c).forEach(({k,c})=>{const sc=sess.scores[k];[sc.a1,sc.a2,sc.b1,sc.b2].forEach(id=>{if(id!=null&&firstCourt[id]===undefined)firstCourt[id]=c;});});
  });
  leaderboardPlayers().forEach(p=>{
    const startCourt=firstCourt[p.id]||(p.currentCourt>0&&p.currentCourt<=NC?p.currentCourt:NC);
    elo[p.id]=1500-((startCourt-1)*100);
  });
  // p84: the scores are the last word on who played. A spare called in tonight has no ladder court yet; seed them
  // from the court they were called onto, so their arrow measures their night like everyone else's.
  Object.keys(firstCourt).forEach(id=>{if(elo[id]===undefined)elo[id]=1500-((firstCourt[id]-1)*100);});
  // p99: a starting number the organizer set for a drop-in replaces the court's own, and only the start: every game
  // after it is scored exactly as it is for everybody else.
  Object.entries(S.seedPoints||{}).forEach(([id,v])=>{const n=Number(v);if(Number.isFinite(n))elo[id]=n;});
  const rating=id=>elo[id]??1000;""",
    """// p106: the number each player STARTS the season from, on its own — the court they first played on (1500 on Court 1,
// 100 fewer for each court below), or the number the organizer set for them (p99). Pulled out of computeEloRatings so
// that "what have they earned this season" can be asked without repeating any of it.
function seedRatings(sessList){
  const elo={};
  const seasonSess=(sessList?[...sessList]:[...(S.sessions||[]),...(S.current?[S.current]:[])]).filter(Boolean); // p76
  const firstCourt={};
  seasonSess.forEach(sess=>{
    Object.keys(sess.scores||{}).map(k=>{const m=k.match(/^c(\\d+)_y(\\d+)_g/);return m?{k,c:+m[1],y:+m[2]}:null;}).filter(Boolean)
      .sort((a,b)=>a.y-b.y||a.c-b.c).forEach(({k,c})=>{const sc=sess.scores[k];[sc.a1,sc.a2,sc.b1,sc.b2].forEach(id=>{if(id!=null&&firstCourt[id]===undefined)firstCourt[id]=c;});});
  });
  // Players who have not played yet start from their current court. (Seeding from the peak court instead would hand
  // every climber a retroactive +100 on top of the rating they earned by winning.)
  leaderboardPlayers().forEach(p=>{
    const startCourt=firstCourt[p.id]||(p.currentCourt>0&&p.currentCourt<=NC?p.currentCourt:NC);
    elo[p.id]=1500-((startCourt-1)*100);
  });
  // p84: the scores are the last word on who played. A spare called in tonight has no ladder court yet; seed them
  // from the court they were called onto, so their arrow measures their night like everyone else's.
  Object.keys(firstCourt).forEach(id=>{if(elo[id]===undefined)elo[id]=1500-((firstCourt[id]-1)*100);});
  // p99: a starting number the organizer set for a drop-in replaces the court's own, and only the start: every game
  // after it is scored exactly as it is for everybody else.
  Object.entries(S.seedPoints||{}).forEach(([id,v])=>{const n=Number(v);if(Number.isFinite(n))elo[id]=n;});
  return elo;
}
function computeEloRatings(sessList,applyCount){ // p84: applyCount limits the rounds played, never the seeding
  const elo=seedRatings(sessList); // p106
  const seasonSess=(sessList?[...sessList]:[...(S.sessions||[]),...(S.current?[S.current]:[])]).filter(Boolean); // p76
  const rating=id=>elo[id]??1000;""")

# ── What a player has earned, cached the same way ─────────────────────────────────────────────────────────────────────
sub("""// p105: where a player stands when the courts have to decide — the rating first, then wins per game, then lowest id so
// the answer is the same every time. Elo is the only one of these numbers that does not move when a player misses a
// night, which is exactly what the court order must not punish.
function byRating(ids,rate,rec){
  return [...ids].sort((x,y)=>{
    const rx=rate[x]??1000,ry=rate[y]??1000;
    if(rx!==ry)return ry-rx;
    const a=rec[x]||{w:0,gp:0},b=rec[y]||{w:0,gp:0};
    const wx=a.gp?a.w/a.gp:0,wy=b.gp?b.w/b.gp:0;
    return wy-wx||x-y;});
}""",
    """// p106: what each player has EARNED this season — their rating now, less the number they started from. Play and
// nothing else: a player who won their way up a court is not still carrying the lower court they began on.
function eloEarnedCached(){
  const rate=eloCached(),seed=seedRatings(),out={};
  Object.keys(rate).forEach(id=>{out[id]=rate[id]-(seed[id]??1000);});
  return out;
}
// p105, p106: where a player stands when the courts have to decide — what they have earned this season, then the court
// they started from, then wins per game, then the lowest id so the answer is the same every time. Measured this way the
// number does not move when a player misses a night, and it does not carry the court they happened to begin on either.
function byRating(ids,earned,seed,rec){
  return [...ids].sort((x,y)=>{
    const ex=earned[x]??0,ey=earned[y]??0;
    if(ex!==ey)return ey-ex;
    const sx=seed[x]??1000,sy=seed[y]??1000;
    if(sx!==sy)return sy-sx;
    const a=rec[x]||{w:0,gp:0},b=rec[y]||{w:0,gp:0};
    const wx=a.gp?a.w/a.gp:0,wy=b.gp?b.w/b.gp:0;
    return wy-wx||x-y;});
}""")

sub("""  {const pinned=new Set([...seated.map(p=>p.id),...spares]),rate=eloCached(),rec=seasonRecord();
   const order=ids=>[...ids.filter(id=>pinned.has(id)),...byRating(ids.filter(id=>!pinned.has(id)),rate,rec)];""",
    """  {const pinned=new Set([...seated.map(p=>p.id),...spares]),earned=eloEarnedCached(),seed=seedRatings(),rec=seasonRecord();
   const order=ids=>[...ids.filter(id=>pinned.has(id)),...byRating(ids.filter(id=>!pinned.has(id)),earned,seed,rec)];""")

sub("""  // p97, p105: order every court by rating, highest first, so the player an over-full court sends down is the weakest
  // on it by the measure that does not punish a player for missing nights.""",
    """  // p97, p105, p106: order every court by the rating each player has EARNED this season, highest first, so the player an
  // over-full court sends down is the weakest on it by a measure that punishes neither a missed night nor a promotion.""")

# The chip shows what the decision is made on.
sub("""  const _rate=eloCached(); // p105""",
    """  const _earned=eloEarnedCached(); // p105, p106""")

sub("""      +`<span class="dnd-rec" style="margin-left:6px;font-size:10px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;">${_rate[p.id]??1000} · ${r.w}W · ${r.pts} pts</span>`""",
    """      +`<span class="dnd-rec" style="margin-left:6px;font-size:10px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;">${(_earned[p.id]??0)>=0?'+':''}${_earned[p.id]??0} · ${r.w}W · ${r.pts} pts</span>`""")

f.write_text(s)
print("p106 applied")
