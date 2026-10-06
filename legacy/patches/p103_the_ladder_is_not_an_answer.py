# p103 (October 6, 2026): setting a player's ladder court is not an answer on their behalf.
#  p98 made ANY court change mark a regular present for the coming session, so that a seat the organizer gave would stick
#  under p96. That was too wide: setPlayerCourt is also how the ladder itself is set — Admin → Players, and the start of a
#  season where every regular is given their court before anybody has voted. Marking them all present then meant the two
#  players who later said "not coming" were still counted as coming, because a present mark outranks a vote.
#  Measured on the season-opener suite: 25 regulars given their courts at setup, 23 voted coming and 2 declined, and the
#  Attendance tab read "25 regulars coming · 0 spare seats" instead of "23 regulars coming · 1 spare seat" — so the spare
#  who had earned the seat was shown as standby and the night would have been a player short.
#  Now only the two places that mean TONIGHT mark a player present: the Assign board (dragging or choosing a court before
#  a session) and the Courts page's + Add. Admin → Players sets the ladder court and nothing else, so a player's own
#  answer is the only thing that says whether they are playing.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""async function setPlayerCourt(id,c){
 const court=Number(c);if(S.current)return moveCourtPlayer(id,court);""",
    """// p103: `tonight` is true only where the organizer is arranging the coming session — the Assign board and the Courts
// page's + Add. From Admin → Players this sets the ladder court and says nothing about who is playing.
async function setPlayerCourt(id,c,tonight){
 const court=Number(c);if(S.current)return moveCourtPlayer(id,court);""")

sub(""" // p90: a regular taken off a court is marked "not coming", and the line-up leaves out everyone who is not coming
 // before it reads anyone's court. Putting them on a court means they are playing, so lift that the way the
 // organizer's own Present mark does — otherwise the seat is written and nothing appears.
 if(court){
  const pre={...(S.preAttendance||{})};
  // p98: anything other than a plain "coming" would keep them out of the line-up (p96 counts silence as not playing),
  // so the organizer's seat is recorded as a Present mark. "Coming" needs no mark and is left alone.
  if((S.rsvp||{})[id]!=='coming'||pre[id]==='absent'){""",
    """ // p90: a regular taken off a court is marked "not coming", and the line-up leaves out everyone who is not coming
 // before it reads anyone's court. Putting them on a court means they are playing, so lift that the way the
 // organizer's own Present mark does — otherwise the seat is written and nothing appears.
 if(court&&tonight){
  const pre={...(S.preAttendance||{})};
  // p98: anything other than a plain "coming" would keep them out of the line-up (p96 counts silence as not playing),
  // so the organizer's seat is recorded as a Present mark. "Coming" needs no mark and is left alone.
  // p103: only when this is about tonight. Setting the ladder court must not answer for the player.
  if((S.rsvp||{})[id]!=='coming'||pre[id]==='absent'){""")

# The two places that mean tonight.
sub("""  if(!court)return removeFromUpcoming(id); // taking a player out before a session means they are not coming
  return setPlayerCourt(id,court);""",
    """  if(!court)return removeFromUpcoming(id); // taking a player out before a session means they are not coming
  return setPlayerCourt(id,court,true); // p103: the board arranges tonight""")

sub("""  if(!S.current){closeModal();await setPlayerCourt(id,court);return showCourtDetail(court);}""",
    """  if(!S.current){closeModal();await setPlayerCourt(id,court,true);return showCourtDetail(court);} // p103: + Add is tonight""")

f.write_text(s)
print("p103 applied")
