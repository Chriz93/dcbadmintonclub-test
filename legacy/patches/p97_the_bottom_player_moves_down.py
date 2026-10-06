# p97 (October 5, 2026): an over-full court sends its bottom player down — the fewest wins, then the fewest points.
#  From the organizer: "court assignments has to be auto completed as the player votes based on thier court movement and
#  point, if a player was absent and he comes back and say he ended on court 3 last time he played, compare the points of
#  current player on court 3, if any player has low score than the drop in player who missed a session the least point
#  person moves down". The ranking is the one they gave for p93: "I move a player down based on thier wins, if wins tie
#  then look at the points scored not ELO".
#  What was wrong: a court can end up with six players — a regular who missed a night comes back to the Court 3 they
#  earned while five others have been promoted onto it, or a spare takes a fifth seat. The engine then sent down "the
#  last to join it", which was whoever happened to sit last in the array: registration order, nothing to do with play.
#  Measured before this patch, seeding Court 3 with five regulars and a sixth coming back moved the sixth down every
#  time, whatever their record — the returning player always lost the court, which is precisely backwards.
#  Now each starting court is listed strongest first: most wins, then most points scored. The engine still sends the
#  bottom player down, so the bottom player is now the weakest on the court by the organizer's own measure — and a
#  returning player with a better record than somebody on the court keeps it, while the weakest moves down.
#  Spares the organizer seated, and spares holding a confirmed seat, are kept at the top: the organizer put them there
#  on purpose, usually because a strong player came, so they are not the ones a full court sends away.
#  The Assign board no longer re-sorts the courts it is given: the line-up itself is now in that order, so the board,
#  the Courts page, the share image and the session that starts all list each court the same way.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""  const res=adjustCourts({nc:NC,lineup:L,names:Object.fromEntries(S.players.map(p=>[p.id,p.name])),locked:[],closed:[],absent:[],returning:[],late:[],partner:true});""",
    """  // p97: order every court strongest first — most wins, then most points scored — so that the player the engine
  // sends down from an over-full court is the weakest on it. Spares the organizer placed stay at the top: that seat was
  // a decision, not something earned, and a full court should not undo it.
  {const pinned=new Set([...seated.map(p=>p.id),...spares]),rec=seasonRecord();
   for(let c=1;c<=NC;c++)L[c]=[...L[c].filter(id=>pinned.has(id)),...byWinsThenPoints(L[c].filter(id=>!pinned.has(id)),rec)];}
  const res=adjustCourts({nc:NC,lineup:L,names:Object.fromEntries(S.players.map(p=>[p.id,p.name])),locked:[],closed:[],absent:[],returning:[],late:[],partner:true});""")

# One order everywhere: the board shows the line-up it was given instead of ranking it a second time.
sub("""    // p93: before a session the court is listed in the order the organizer decides on — most wins, then most points,
    // so the player to move down is last. During a session the court keeps the order the night put it in.
    const pids=S.current?(a[c]||[]):byWinsThenPoints(a[c]||[],_rec);""",
    """    // p93, p97: the line-up itself is ordered most wins then most points before a session (autoAssign), so the board
    // shows the order it was given — the same order as the Courts page — and the player to move down is last.
    const pids=(a[c]||[]);""")

f.write_text(s)
print("p97 applied")
