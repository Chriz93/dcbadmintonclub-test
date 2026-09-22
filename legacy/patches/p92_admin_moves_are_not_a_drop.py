# p92 (September 22, 2026): a court change the organizer makes is not counted as a court drop.
#  From the organizer, asked whether a pre-session move should change the court a player earned: "Yes, moving a player
#  rewrites the court they have earned, but only when a high caliber player comes, and its upto the admin to make that
#  decision, so I can reorgranise the courts, it should not show as a drop in thier stats or anything."
#  Measured before this patch: moving a player from Court 3 to Court 5 left their rating (1379), their wins and losses
#  and their best court untouched — but their court-climb figure went from -1 to -3, recording a two-court drop for a
#  night they had not played. Court climb is `first session's court - court now`, and the organizer's move moves the
#  second half of that subtraction.
#  Now every court change the organizer makes by hand is remembered as an adjustment (admin_court_moves: the running
#  total of courts moved, down positive, up negative) and added back when the climb is worked out. So the figure keeps
#  measuring what a player did on court: a courtesy move down for a strong spare costs them nothing, and a move up
#  hands them nothing either. Their rating, record and best court were never affected and still are not.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""    draft.preAttendance=await loadKV('pre_session_attendance')||{};""",
    """    draft.preAttendance=await loadKV('pre_session_attendance')||{};
    draft.adminCourtMoves=await loadKV('admin_court_moves')||{}; // p92: courts the organizer moved by hand, not won""")

# Remember the adjustment as part of the same seat change.
sub(""" const p=S.players.find(x=>x.id===id);if(!p)return;
 const seatsBefore=upcomingSeats(); // p89""",
    """ const p=S.players.find(x=>x.id===id);if(!p)return;
 const seatsBefore=upcomingSeats(); // p89
 // p92: the organizer's own move is not something the player did on court. Remember it so the court-climb figure can
 // leave it out. Seating someone who had no court, or taking their court away, is not a move between courts.
 const wasCourt=p.currentCourt;
 if(court>0&&wasCourt>0&&court!==wasCourt){
  const moves={...(S.adminCourtMoves||{})};
  moves[id]=(moves[id]||0)+(court-wasCourt);
  try{await setKV('admin_court_moves',moves);S.adminCourtMoves=moves;}
  catch(e){await loadAll();renderAll();return toast('Court not changed: '+e.message,'error');}
 }""")

# Give the climb back what the organizer took (or took away what the organizer gave).
sub("""    const courtClimb=allSessions.length>0?startCourt-currentPos:0;""",
    """    // p92: add back every court the organizer moved them by hand, so the figure is what they did on court.
    const adminMoved=(S.adminCourtMoves||{})[p.id]||0;
    const courtClimb=allSessions.length>0?startCourt-currentPos+adminMoved:0;""")

f.write_text(s)
print("p92 applied")
