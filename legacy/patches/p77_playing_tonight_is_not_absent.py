# p77 (September 18, 2026): a player on a court tonight is never shown as absent.
#  From the organizer: "Sam MacDonald SPARE (absent) why does sam shown as absent, he was playing as spare, when
#  Ivanka Xie backed out at the last moment, I called in sam".
#  Why it happened: Leaders and Rankings decided "active" from the player's ladder court alone (players.current_court).
#  A spare seated at the start of a session gets one; a spare CALLED IN once the night is under way does not get one
#  until End Session writes the courts. Sam played six games on Court 6 and was on the court at that moment, yet both
#  lists called him absent and showed "Absent" instead of his court.
#  Now a player counts as playing whenever tonight's courts hold them, so the tag and the court line follow the night.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# Rankings: playing tonight counts, whether or not a ladder court has been written yet.
sub("""    const rating=elo[p.id]||1000;
    const isActive=p.currentCourt>0;""",
    """    const rating=elo[p.id]||1000;
    const isActive=p.currentCourt>0||courtOfPlayer(p.id)>0; // p77: on a court tonight is playing, not absent""")
# Leaders: the same rule, so the two lists never disagree about who is playing.
sub("""    const isActive=p.currentCourt>0;
    const courtPos=isActive?getCourtPos(p):0;""",
    """    const isActive=p.currentCourt>0||courtOfPlayer(p.id)>0; // p77
    const courtPos=isActive?getCourtPos(p):0;""")

f.write_text(s)
print("p77 applied")
