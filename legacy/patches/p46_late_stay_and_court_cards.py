# p46 (September 12, 2026): a late arrival who has to stay is settled when Adjust courts is applied, and the court cards
# on the Courts page open with the keyboard.
#  - Before: when the only news was a late player who had to stay (the court below full or scored, or leaving would
#    leave someone alone), Apply said "Nothing to change" and left the late mark waiting, so a later adjustment — even
#    in the next round — could still move them. Apply now records the stay, as it already did when other courts
#    changed, and says "Recorded for Round N — no court changes." (found by the new evening-sequence tests).
#  - The gym-view court cards are buttons: Tab reaches them, and Enter or Space opens the court's details, as a tap does.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""  if(!res.changed&&adjSame(P.input.closed,S.current?.closedCourts||[]))return toast('Nothing to change','info');""",
    """  const settles=(S.current?.latePlayers||[]).some(l=>l.pending&&res.skippedLate.some(x=>x.id===l.playerId));
  if(!res.changed&&!settles&&adjSame(P.input.closed,S.current?.closedCourts||[]))return toast('Nothing to change','info');""")
sub("""    const n=adjCount(res);toast(`Courts adjusted for Round ${cy} — ${n} change${n===1?'':'s'}. Undo is on the Attendance tab.`,'success');""",
    """    const n=adjCount(res);toast(n?`Courts adjusted for Round ${cy} — ${n} change${n===1?'':'s'}. Undo is on the Attendance tab.`:`Recorded for Round ${cy} — no court changes. Undo is on the Attendance tab.`,'success');""")
sub("""      return `<div class="gym-court ${cls}" onclick="showCourtDetail(${c})">""",
    """      return `<div class="gym-court ${cls}" role="button" tabindex="0" onclick="showCourtDetail(${c})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showCourtDetail(${c});}">""")
f.write_text(s)
print("p46 applied")
