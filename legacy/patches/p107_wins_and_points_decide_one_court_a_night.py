# p107 (October 6, 2026): the season's wins and points decide where a player stands, and nobody is sent down more than
#  one court in an evening.
#  From the organizer, correcting p105 and p106 in two steps:
#    "i have given ratings to the players based on thier level at first, because the games are hard on court 1 and 2,
#     they should not be moved to court 4 or 5 just becuase they didnt win"
#    "if a player plays and drops down, then we look at the points earned in this season not the ELO, thats a genuine
#     case where the player plays and drops down the court, if the player keeps loosing he/she can reach upto court 6,
#     there is no hard rule that a good player will only drop to 2 courts down"
#  TWO DIFFERENT THINGS MOVE A PLAYER DOWN A COURT, and they are not the same rule:
#    * the ROTATION at the end of a night — they played and lost, so they drop a court. That happens every night with no
#      floor: keep losing and you reach Court 6. Nothing in p96-p106 touched it and nothing here does either.
#    * the pre-session SETTLE — a court has six because somebody came back to the court they earned, so one player has to
#      move for the night to be playable. That is what "should not be moved to court 4 or 5 just becuase they didnt win"
#      is about, and it is now capped at a single court per player per evening: the player a court sends down is the
#      bottom one who has NOT already been moved this evening. (A player can still be moved UP afterwards — the bottom
#      court has nothing below it, so the engine places its overflow above.)
#  WHAT DECIDES IT is what the organizer has now said three times: the season's wins, and the points scored when wins
#  tie ("I move a player down based on thier wins, if wins tie then look at the points scored not ELO" — p93). p106's
#  measure (the rating a player had earned this season) goes with it, and the rating goes back to deciding nothing about
#  courts: it is the number on Standings → Rankings, where a no-show still costs 25 of it (p105).
#  Measured on the league's own data (production backup, 4 October) this is also the only measure that reads right to
#  the organizer: by rating, Court 1 sends down Allon Chauhan, 12 wins from 18 and the joint best record on the court,
#  because he started on Court 2 and the rating still carries that; by wins and points he stands second and Gary Wan,
#  6 wins from 18, is the one who moves.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""// p106: what each player has EARNED this season — their rating now, less the number they started from. Play and
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
}""",
    """// p107: where a player stands is the organizer's own measure — the season's wins, then the points scored when wins tie,
// then the lowest id so the answer is the same every time (byWinsThenPoints, p93). The rating decides nothing here.""")

sub("""  // p97, p105, p106: order every court by the rating each player has EARNED this season, highest first, so the player an
  // over-full court sends down is the weakest on it by a measure that punishes neither a missed night nor a promotion. Spares the organizer placed stay at the top:
  // that seat was a decision, not something earned, and a full court should not undo it.
  {const pinned=new Set([...seated.map(p=>p.id),...spares]),earned=eloEarnedCached(),seed=seedRatings(),rec=seasonRecord();
   const order=ids=>[...ids.filter(id=>pinned.has(id)),...byRating(ids.filter(id=>!pinned.has(id)),earned,seed,rec)];
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
   }}""",
    """  // p97, p107: order every court by the season's wins, then the points scored, so the player an over-full court sends
  // down is the one standing lowest by the organizer's own measure. Spares the organizer placed stay at the top: that
  // seat was a decision, not something earned, and a full court should not undo it.
  {const pinned=new Set([...seated.map(p=>p.id),...spares]),rec=seasonRecord();
   const order=ids=>[...ids.filter(id=>pinned.has(id)),...byWinsThenPoints(ids.filter(id=>!pinned.has(id)),rec)];
   for(let c=1;c<=NC;c++)L[c]=order(L[c]);
   // p105, p107: a court of more than five sends a player to the next court in use below and places them there by the
   // same measure, and that court settles the same way — "where he fits in with the points" — instead of dropping them
   // at the bottom of whichever court took them. The player sent down is the bottom one who has NOT already been moved
   // this evening, so nobody falls more than a single court in one night. Losing a night's play still costs a court at
   // the end of the night, every night, with no floor: that is the rotation, and it is untouched.
   const arrived=new Set();
   for(let c=1;c<NC;c++){
     while(L[c].length>5){
       let to=0;for(let x=c+1;x<=NC;x++)if(L[x].length){to=x;break;}
       if(!to)break;                                   // nothing in use below: the engine places them
       let i=L[c].length-1;
       while(i>=0&&(pinned.has(L[c][i])||arrived.has(L[c][i])))i--;
       if(i<0)break;                                   // everyone left was placed by the organizer, or has moved already
       const moved=L[c][i];
       L[c]=L[c].filter(x=>x!==moved);L[to]=order([...L[to],moved]);arrived.add(moved);
       notes.push(`Court ${c} would have more than five players, so ${nm(moved)} starts on Court ${to}.`);
     }
   }}""")

sub("""  const _earned=eloEarnedCached(); // p105, p106""",
    """  // p107: the two numbers the decision is made on.""")

sub("""      +`<span class="dnd-rec" style="margin-left:6px;font-size:10px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;">${(_earned[p.id]??0)>=0?'+':''}${_earned[p.id]??0} · ${r.w}W · ${r.pts} pts</span>`""",
    """      +`<span class="dnd-rec" style="margin-left:6px;font-size:10px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;">${r.w}W · ${r.pts} pts</span>`""")

f.write_text(s)
print("p107 applied")
