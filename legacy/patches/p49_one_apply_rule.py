# p49 (September 12, 2026): the Adjust courts preview and Apply use one rule for "is there something to apply".
#  - The preview only enabled Apply when a player moved, so a late arrival who had to stay (p46) could not be recorded
#    from the preview, and marking an empty court unavailable could never be applied. Both now enable Apply, exactly
#    when Apply would save something: a court change, a late arrival to settle, or a change to the unavailable courts.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""  const settles=(S.current?.latePlayers||[]).some(l=>l.pending&&res.skippedLate.some(x=>x.id===l.playerId));
  if(!res.changed&&!settles&&adjSame(P.input.closed,S.current?.closedCourts||[]))return toast('Nothing to change','info');""",
    """  if(!adjCanApply(res,P))return toast('Nothing to change','info');""")
sub("""${res.ok&&res.changed?'':'disabled'}>✓ Apply changes</button>""", """${adjCanApply(res,P)?'':'disabled'}>✓ Apply changes</button>""")
sub("""function adjustModalHtml(again){""",
    """// Something to apply: a court change, a late arrival to settle (moved or recorded as staying), or a change to the
// courts marked unavailable. The preview's Apply button and Apply itself both use this.
function adjCanApply(res,P){return !!res.ok&&(res.changed||(S.current?.latePlayers||[]).some(l=>l.pending&&res.skippedLate.some(x=>x.id===l.playerId))||!adjSame(P.input.closed,S.current?.closedCourts||[]));}
function adjustModalHtml(again){""")
f.write_text(s)
print("p49 applied")
