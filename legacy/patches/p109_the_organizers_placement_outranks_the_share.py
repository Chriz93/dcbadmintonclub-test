# p109 (October 9, 2026): the organizer's own placement outranks tonight's share. The court settles around it.
#  FOUND BY p108's own test run, not by reading. Before p108 a court tolerated five, so when the organizer dragged a
#  player onto a court of four the move simply stuck. With the share down to four, the settling treated that player as
#  the court's bottom and sent them straight back down: the board said Court 4, the line-up said Court 3, and nothing
#  explained why. caught by tabs/assign-before-session.spec.ts ("the board follows").
#  WHY IT WAS POSSIBLE. autoAssign pins the players the organizer SEATED — but organizerSeated() returns spares only
#  (p71), so a regular the organizer moved on the board was never pinned. Pre-p108 nothing noticed.
#  THE RULE. A court the organizer has placed somebody on tonight settles around that placement: the placed player
#  stays, and the court sends down its weakest player who was NOT placed by hand. That is exactly how a seated spare
#  has behaved since p71 — the organizer's decision is not something the machine undoes — and it is what "only admin
#  may move players up a court or down a court" has to mean once a court can be over its share.
#  WHERE IT IS REMEMBERED. `admin_court_moves`, which L28 already carries through Undo and a season rollover, so no new
#  migration and no new key. Its value per player grows from a bare number (the court delta p92 subtracts from the
#  climb figure) to {d, s, c}: the same delta, plus the session the placement was for and the court it was onto. Old
#  rows are plain numbers and are still read as {d: n}, so nothing already in production has to be rewritten.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# One reader for both shapes, so a row written before today still means what it meant.
sub("""function nightCaps(total,used){""",
    """// p109: what the organizer did by hand to one player. Rows written before p109 are a bare delta; rows written since
// also carry the session the placement was for (s) and the court it was onto (c).
function adminMoveOf(id){const v=(S.adminCourtMoves||{})[id];return v==null?{d:0}:typeof v==='number'?{d:v}:{d:v.d||0,s:v.s,c:v.c};}
// p109: the players the organizer placed on a court for tonight — their placement is not the machine's to undo.
function adminPlacedTonight(){
  if(S.current)return new Set();
  const n=upcomingSessionNumber(),out=new Set();
  for(const p of S.players){const m=adminMoveOf(p.id);if(m.s===n&&m.c>0&&m.c===p.currentCourt)out.add(p.id);}
  return out;}
function nightCaps(total,used){""")

# Remember the placement, not only the delta.
sub("""  const moves={...(S.adminCourtMoves||{})};
  moves[id]=(moves[id]||0)+(court-wasCourt);
  try{await setKV('admin_court_moves',moves);S.adminCourtMoves=moves;}""",
    """  const moves={...(S.adminCourtMoves||{})},was=adminMoveOf(id);
  // p109: the delta p92 subtracts from the climb figure, and — when this is about tonight — the placement itself.
  moves[id]={d:was.d+(court-wasCourt),...(tonight?{s:upcomingSessionNumber(),c:court}:(was.s?{s:was.s,c:was.c}:{}))};
  try{await setKV('admin_court_moves',moves);S.adminCourtMoves=moves;}""")

sub("""    const adminMoved=(S.adminCourtMoves||{})[p.id]||0;""",
    """    const adminMoved=adminMoveOf(p.id).d; // p109: the delta, whichever shape the row is in""")

# The pin. A placed player stays; the court sheds its weakest player that the organizer did not place.
sub("""  {const pinned=new Set([...seated.map(p=>p.id),...spares]),rec=seasonRecord();""",
    """  // p109: the organizer's placements for tonight are pinned alongside the spares they seated by hand.
  {const pinned=new Set([...seated.map(p=>p.id),...spares,...adminPlacedTonight()]),rec=seasonRecord();""")

f.write_text(s)
print("p109 applied")
