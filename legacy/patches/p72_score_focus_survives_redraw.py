# p72 (September 14, 2026): a redraw of the score form no longer drops the cursor out of the score being typed.
#  Found by the ten-session season test failing now and then on GitHub (the first save of session 1: "Enter all 3
#  scores", with Game 1's first box empty). The score form is rebuilt whenever the page redraws. Typed values were
#  already carried over, but the input under the cursor was replaced, so focus fell back to the page and the next
#  keystrokes were lost: an organizer typing a score when the page redrew (after a save on another court, a reload,
#  Start Session's refresh…) had to tap the box again, and a digit typed in that instant vanished. Only the 20-second
#  background sync kept the inputs. Now, when the form is redrawn for the same court and round, the score box that had
#  the cursor gets it back, with the same selection, so typing carries on.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""  const _prevCourt=parseInt(el.dataset.court||0);
""", """  const _prevCourt=parseInt(el.dataset.court||0);
  // p72: the score box under the cursor, to give it back after a redraw of the same court and round.
  const _focus=(()=>{const a=document.activeElement;return a&&a.classList&&a.classList.contains('sinp')&&el.contains(a)&&_prevCy===cy&&_prevCourt===court?{id:a.id,start:a.selectionStart,end:a.selectionEnd}:null;})();
""")
sub("""  combos.forEach(({g})=>liveW(court,g));
  // Stamp cycle+court""", """  if(_focus){const f=document.getElementById(_focus.id);if(f&&f!==document.activeElement){f.focus({preventScroll:true});try{f.setSelectionRange(_focus.start,_focus.end);}catch(e){}}} // p72
  combos.forEach(({g})=>liveW(court,g));
  // Stamp cycle+court""")

f.write_text(s)
print("p72 applied")
