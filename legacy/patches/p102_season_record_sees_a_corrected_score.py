# p102 (October 5, 2026): the season's wins and points notice a score being corrected.
#  seasonRecord() (p93) caches its answer against a key built from each session's id and how MANY scores it holds. A
#  correction through Admin → ✏️ Edit scores (p87) changes what a score says without changing how many there are, and the
#  session keeps its id — so the key was identical and the cached record was served instead. Until the page was reloaded,
#  the Assign board's chips, the order each court is listed in and the player an over-full court sends down (p97) were all
#  worked out from the scores as they were BEFORE the correction. Found while testing p97: two leagues with the same
#  number of games but different winners produced the first league's ranking for both.
#  The key now carries what the scores say, not just how many there are: each game's winner and its two numbers, summed.
#  Any correction, in any session, changes it. Counting the sum is arithmetic over the same games the record would walk,
#  so a redraw still costs one pass instead of rebuilding the record for every chip on the board.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""  const key=sess.map(x=>`${x.id}:${Object.keys(x.scores||{}).length}`).join('|');""",
    """  // p102: what the games say, not just how many there are — who played them, what they scored and who won, in order.
  // A correction keeps the session's id and its number of scores, so neither of those can tell the record it is stale.
  const key=sess.map(x=>`${x.id}:${Object.keys(x.scores||{}).length}:${Object.entries(x.scores||{}).reduce((t,[k,sc])=>{
    if(!sc)return t;
    const h=(sc.a1||0)*3+(sc.a2||0)*5+(sc.b1||0)*11+(sc.b2||0)*13+(sc.sA||0)*31+(sc.sB||0)*37+(sc.w==='A'?1:sc.w==='B'?2:0)+k.length;
    return (t*33+h)>>>0;},0)}`).join('|');""")

f.write_text(s)
print("p102 applied")
