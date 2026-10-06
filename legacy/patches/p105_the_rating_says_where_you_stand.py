# p105 (October 6, 2026): the rating decides where a player stands on a court, a displaced player is placed by rating in
#  the court below, and a no-show costs 25 rating points.
#  From the organizer, 6 October: "in case a player who voted no and and comeback then we look if that coming back player
#  has more points than anyone in that court, if he has more points then he retains, the lowest point person moves down,
#  if he doesnt then he moves to the next court, where he fits in with the points"; "The top players should not go down 3
#  courts if they miss 4 sessions say, what logic can we use here, I think we should use the ranking points also"; and
#  "if a player said yes and he didnt show up, then his points should go down and he/she miust be punished".
#  What was wrong: p97 ordered each court by SEASON TOTALS — 12W, 352 points. A player who missed four of six sessions
#  holds about a third of everyone's wins and a third of their points through no fault of form, so they sorted last on
#  every court and fell court after court. The measure, not the cascade, was what dropped them.
#  The rating does not move when a player does not play: it is points per game, it accounts for who they beat, it cannot
#  spike from one night (a round moves it by at most 32), and the organizer can set it by hand for a drop-in (p99). It is
#  the number Standings → Rankings already shows. So:
#   * each starting court is listed by rating, highest first, with wins per game breaking a tie and the spares the
#     organizer placed kept at the top (p97's rule, a better measure);
#   * a court of more than five sends its bottom player to the next court in use below and places them there BY RATING,
#     and that court settles the same way — so a player stops at the first court where somebody is below them, which is
#     what "he moves to the next court, where he fits in with the points" asks for. A strong player who missed four
#     nights keeps their rating, so they stop at the first court and do not slide;
#   * a no-show costs 25 rating points, once, on the night it happened, on top of the court it already costs
#     (finalize_session). A round's biggest possible swing is 32, so it costs a little less than losing a whole round.
#     Only a player who said they were coming can be marked absent, so declining in time and never answering still cost
#     nothing (p96).
#  The chip keeps the wins and points as the human-readable record and now leads with the rating, the deciding number.
#  computeEloRatings is also given a cache, keyed exactly as seasonRecord's: mySeasonData called it once PER PLAYER to
#  work out one ranking position, so opening My Season walked the whole season forty times over.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# ── One stamp for "the games have changed", shared by the record and the ratings ───────────────────────────────────────
sub("""  // p102: what the games say, not just how many there are — who played them, what they scored and who won, in order.
  // A correction keeps the session's id and its number of scores, so neither of those can tell the record it is stale.
  const key=sess.map(x=>`${x.id}:${Object.keys(x.scores||{}).length}:${Object.entries(x.scores||{}).reduce((t,[k,sc])=>{
    if(!sc)return t;
    const h=(sc.a1||0)*3+(sc.a2||0)*5+(sc.b1||0)*11+(sc.b2||0)*13+(sc.sA||0)*31+(sc.sB||0)*37+(sc.w==='A'?1:sc.w==='B'?2:0)+k.length;
    return (t*33+h)>>>0;},0)}`).join('|');
  if(_seasonRecCache&&_seasonRecKey===key)return _seasonRecCache;""",
    """  const key=seasonStamp(sess); // p102, p105
  if(_seasonRecCache&&_seasonRecKey===key)return _seasonRecCache;""")

sub("""let _seasonRecCache=null,_seasonRecKey='';""",
    """// p102, p105: what the games say, not just how many there are — who played them, what they scored, who won and who was
// marked absent, in order. A correction (Edit scores) keeps the session's id and its number of scores, so neither of
// those can tell a cached answer that it is stale. Integer arithmetic, so a redraw costs one pass, not a rebuild.
function seasonStamp(sess){
  return sess.map(x=>`${x.id}:${Object.keys(x.scores||{}).length}:${Object.entries(x.scores||{}).reduce((t,[k,sc])=>{
    if(!sc)return t;
    const h=(sc.a1||0)*3+(sc.a2||0)*5+(sc.b1||0)*11+(sc.b2||0)*13+(sc.sA||0)*31+(sc.sB||0)*37+(sc.w==='A'?1:sc.w==='B'?2:0)+k.length;
    return (t*33+h)>>>0;},0)}:${Object.entries(x.attendance||{}).reduce((t,[id,v])=>v==='absent'?(t*33+Number(id))>>>0:t,0)}`).join('|');
}
let _seasonRecCache=null,_seasonRecKey='';
let _eloCache=null,_eloKey='';
// p105: the whole season's ratings, worked out once per change. mySeasonData asked for them once per player.
function eloCached(){
  const sess=[...(S.sessions||[]),...(S.current?[S.current]:[])].filter(Boolean);
  const key=seasonStamp(sess)+'|'+(S.players||[]).map(p=>`${p.id}:${p.currentCourt}`).join(',')+'|'+JSON.stringify(S.seedPoints||{});
  if(_eloCache&&_eloKey===key)return _eloCache;
  _eloCache=computeEloRatings();_eloKey=key;return _eloCache;
}
// p105: where a player stands when the courts have to decide — the rating first, then wins per game, then lowest id so
// the answer is the same every time. Elo is the only one of these numbers that does not move when a player misses a
// night, which is exactly what the court order must not punish.
function byRating(ids,rate,rec){
  return [...ids].sort((x,y)=>{
    const rx=rate[x]??1000,ry=rate[y]??1000;
    if(rx!==ry)return ry-rx;
    const a=rec[x]||{w:0,gp:0},b=rec[y]||{w:0,gp:0};
    const wx=a.gp?a.w/a.gp:0,wy=b.gp?b.w/b.gp:0;
    return wy-wx||x-y;});
}""")

sub("""  const rank=[...leaderboardPlayers()].map(x=>({id:x.id,r:computeEloRatings()[x.id]||0})).sort((a,b)=>b.r-a.r).findIndex(x=>x.id===p.id)+1;""",
    """  const rank=[...leaderboardPlayers()].map(x=>({id:x.id,r:eloCached()[x.id]||0})).sort((a,b)=>b.r-a.r).findIndex(x=>x.id===p.id)+1; // p105: one pass, not one per player""")

sub("""function mySeasonData(p){
  const elo=computeEloRatings()[p.id]||0;""",
    """function mySeasonData(p){
  const elo=eloCached()[p.id]||0; // p105""")

# ── A no-show costs 25 rating points ──────────────────────────────────────────────────────────────────────────────────
sub("""      Object.keys(sum).forEach(id=>{elo[id]=rating(id)+32*(sum[id]/cnt[id]);});
    });
  });""",
    """      Object.keys(sum).forEach(id=>{elo[id]=rating(id)+32*(sum[id]/cnt[id]);});
    });
    // p105: a player who said they were coming and did not turn up loses NO_SHOW_PENALTY points for that night, on top
    // of the court it already costs them (finalize_session). Only a player who said yes can be marked absent, so a
    // decline in time and a night nobody answered for cost nothing (p96).
    Object.entries(sess.attendance||{}).forEach(([id,v])=>{if(v==='absent')elo[id]=rating(id)-NO_SHOW_PENALTY;});
  });""")

sub("""function courtTarget(n){return n===5?15:21;}         // five-player games go to 15, everything else to 21""",
    """function courtTarget(n){return n===5?15:21;}         // five-player games go to 15, everything else to 21
// p105: what a no-show costs in rating points. A round moves a rating by at most 32, so this is a little less than
// losing a whole round — real, and not more than the night itself could have cost them.
const NO_SHOW_PENALTY=25;""")

# ── Tonight's courts are settled by rating ────────────────────────────────────────────────────────────────────────────
sub("""  // p97: order every court strongest first — most wins, then most points scored — so that the player the engine
  // sends down from an over-full court is the weakest on it. Spares the organizer placed stay at the top: that seat was
  // a decision, not something earned, and a full court should not undo it.
  {const pinned=new Set([...seated.map(p=>p.id),...spares]),rec=seasonRecord();
   for(let c=1;c<=NC;c++)L[c]=[...L[c].filter(id=>pinned.has(id)),...byWinsThenPoints(L[c].filter(id=>!pinned.has(id)),rec)];}""",
    """  // p97, p105: order every court by rating, highest first, so the player an over-full court sends down is the weakest
  // on it by the measure that does not punish a player for missing nights. Spares the organizer placed stay at the top:
  // that seat was a decision, not something earned, and a full court should not undo it.
  {const pinned=new Set([...seated.map(p=>p.id),...spares]),rate=eloCached(),rec=seasonRecord();
   const order=ids=>[...ids.filter(id=>pinned.has(id)),...byRating(ids.filter(id=>!pinned.has(id)),rate,rec)];
   for(let c=1;c<=NC;c++)L[c]=order(L[c]);
   // p105: a court of more than five sends its bottom player to the next court in use below and places them there BY
   // RATING; that court then settles the same way. So a player coming back to the court they earned keeps it when
   // somebody on it is below them, and otherwise stops at the first court below where somebody is — "where he fits in
   // with the points" — instead of being dropped to the bottom of whichever court took them.
   for(let c=1;c<NC;c++){
     while(L[c].length>5){
       let to=0;for(let x=c+1;x<=NC;x++)if(L[x].length){to=x;break;}
       if(!to)break;                                   // nothing in use below: the engine places them
       const moved=L[c][L[c].length-1];
       if(pinned.has(moved))break;                     // everyone left was placed by the organizer
       L[c]=L[c].slice(0,-1);L[to]=order([...L[to],moved]);
       notes.push(`Court ${c} would have more than five players, so ${nm(moved)} starts on Court ${to}.`);
     }
   }}""")

# The chip leads with the number the decision is made on.
sub("""  const _chip=(p,c)=>{const r=_rec[p.id]||{w:0,l:0,pts:0};""",
    """  const _rate=eloCached(); // p105
  const _chip=(p,c)=>{const r=_rec[p.id]||{w:0,l:0,pts:0};""")

sub("""      +`<span class="dnd-rec" style="margin-left:6px;font-size:10px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;">${r.w}W · ${r.pts} pts</span>`""",
    """      +`<span class="dnd-rec" style="margin-left:6px;font-size:10px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;">${_rate[p.id]??1000} · ${r.w}W · ${r.pts} pts</span>`""")

f.write_text(s)
print("p105 applied")
