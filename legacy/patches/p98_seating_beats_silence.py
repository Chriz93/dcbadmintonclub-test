# p98 (October 5, 2026): seating a player who never answered puts them in tonight's line-up.
#  The follow-through from p96. Now that silence keeps a regular off the courts, the organizer's own act of seating one
#  has to say louder than that silence — the same way it already overrode a "not coming" vote (p90). Without this,
#  dragging a player who had not voted onto Court 4 wrote their court and then the line-up left them out again, and the
#  board showed the move undoing itself: the exact complaint from p93 ("I TRIED adding Rahul Tamarkar to court 4, it
#  didnt work"), reintroduced by the new rule.
#  Now: putting a regular on a court marks them present for the coming session unless they have already said "coming",
#  so the seat sticks whatever their answer was — no answer, or no.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""  if((S.rsvp||{})[id]==='notcoming'||pre[id]==='absent'){
   pre[id]='present';""",
    """  // p98: anything other than a plain "coming" would keep them out of the line-up (p96 counts silence as not playing),
  // so the organizer's seat is recorded as a Present mark. "Coming" needs no mark and is left alone.
  if((S.rsvp||{})[id]!=='coming'||pre[id]==='absent'){
   pre[id]='present';""")

f.write_text(s)
print("p98 applied")
