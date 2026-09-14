# p70 (September 14, 2026): "Seat" is removed from Attendance's "Marked present but not on a court".
#  From the organizer (TEST, September 14): "remove Seat too". Players are set before the session starts (p68); the box
#  for players marked present without a court (the p57 count fix) offered "🪑 Seat", which put them on a court during
#  the session. It now offers only "Not here", which clears the mark, and says why.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""    <div style="margin:4px 0 6px;">They are not counted as present until they have a court. Seat puts them on their own court, or the nearest court with room.</div>""",
    """    <div style="margin:4px 0 6px;">They are not counted as present. Players are set before the session starts, so nobody is seated now: “Not here” clears the mark.</div>""")
sub("""<button class="btn btn-success btn-sm" style="margin:0;" aria-label="Seat ${esc(p.name)} on a court" onclick="changePlayerAttendance(${p.id},'present')">🪑 Seat</button>""", "")

f.write_text(s)
print("p70 applied")
