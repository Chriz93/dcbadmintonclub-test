# p64 (September 13, 2026): every clickable control can be reached and worked from the keyboard after any redraw.
#  Found by the keyboard census (tabs/keys.spec.ts): clickable tags and rows (the Players tag, history rows, court
#  cards, payment and waiver tags…) get a button role and a Tab stop from improveSemantics, which ran only after a
#  full redraw or when a dialog opened. A list or form drawn again on its own (a tab, the Players list after a tap,
#  the score form) left its clickable parts out of the Tab order until the next full redraw, so a keyboard or screen
#  reader user could not reach them.
#  - improveSemantics now also runs after any part of the page is drawn again (once per batch of changes). It only
#    sets attributes, so it does not set itself off again.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("  document.querySelectorAll('.bnav-btn').forEach(e=>e.setAttribute('aria-current',e.classList.contains('active')?'page':'false'));\n}\n",
    "  document.querySelectorAll('.bnav-btn').forEach(e=>e.setAttribute('aria-current',e.classList.contains('active')?'page':'false'));\n}\n"
    "// p64: any part of the page drawn again gets the same treatment (once per batch of changes; attributes only, so the\n"
    "// observer is not set off again).\n"
    "{let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;improveSemantics();});})\n"
    " .observe(document.body,{childList:true,subtree:true});}\n")

f.write_text(s)
print("p64 applied")
