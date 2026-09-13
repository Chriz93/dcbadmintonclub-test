# p59 (September 13, 2026): a page load overtaken by one of the page's own saves is repeated, not dropped.
#  - p58 dropped such a load and relied on the save's own reload to show the new data. In the full run a saved private
#    note still vanished (Admin extras 091): the note's own reload was itself overtaken by a later write that does not
#    reload afterwards (an organizer action's undo checkpoint settles after the action), so no load applied and the
#    screen kept old data until the next 20-second refresh.
#  - Now loadAll repeats a load that a save overtook, at most three times, so the load that applies always started after
#    the latest save. Stale data is still never drawn, and fresh data is always drawn.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""async function loadAll(){
  _activeLoads++;
  const seq=_writeSeq,""", """// p59: a load that one of this page's saves overtook is repeated (at most three times) instead of dropped, so the load
// that applies always started after the latest save, even when that save does not reload by itself.
async function loadAll(){for(let k=0;k<3;k++){const r=await _loadAllOnce();if(r!=='stale')return r;}return 'stale';}
async function _loadAllOnce(){
  _activeLoads++;
  const seq=_writeSeq,""")
f.write_text(s)
print("p59 applied")
