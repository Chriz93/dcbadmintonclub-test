# p47 (September 12, 2026): two keyboard and screen-reader fixes found while writing the dialog tests.
#  - The Adjust courts preview redraws the Attendance bar while it opens, so the button that opened it is replaced; on
#    closing, the focus now goes to the redrawn control with the same id instead of being lost to the page.
#  - The Players tab's note buttons showed only an emoji (a screen reader said "clipboard"); each now says whose note it
#    is: "Add a private note for <name>" or "Private note for <name>".
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""const r=_modalReturn;_modalReturn=null;if(was&&r&&r!==document.body&&document.contains(r)&&typeof r.focus==='function')r.focus({preventScroll:true});}""",
    """let r=_modalReturn;_modalReturn=null;if(r&&!document.contains(r)&&r.id)r=document.getElementById(r.id);if(was&&r&&r!==document.body&&document.contains(r)&&typeof r.focus==='function')r.focus({preventScroll:true});}""")
sub("""<button class="notes-btn" onclick="openAdminNote(${p.id})">${noteIcon}</button>""",
    """<button class="notes-btn" onclick="openAdminNote(${p.id})" aria-label="${p.adminNote?'Private note':'Add a private note'} for ${esc(p.name)}" title="${p.adminNote?'Private note':'Add a private note'} for ${esc(p.name)}">${noteIcon}</button>""")
f.write_text(s)
print("p47 applied")
