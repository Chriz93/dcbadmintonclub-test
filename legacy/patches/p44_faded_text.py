# p44 (September 12, 2026): the last contrast failures found by the axe checks (WCAG 2.2 AA, 4.5:1 for text).
#  - Absent players' rows on the Session tab, absent players' cards under Standings → Player stats, and skipped courts in
#    the round progress were faded with opacity, which made their grey text unreadable (2.1:1 to 3.6:1).
#  - They sit on the grey card colour instead, and a skipped court gets a dashed edge, so every text keeps at least 4.5:1.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""${isAbsentInSess?'opacity:0.5;':''}""", """${isAbsentInSess?'background:var(--s2);':''}""")
sub("""<div style="background:var(--s3);border-radius:8px;padding:8px;text-align:center;opacity:0.5;">""",
    """<div style="background:var(--s2);border:1px dashed var(--border);border-radius:8px;padding:8px;text-align:center;">""")
sub("""<div class="card" style="${isAbsent?'opacity:0.7;':''}">""", """<div class="card" style="${isAbsent?'background:var(--s2);':''}">""")
f.write_text(s)
print("p44 applied")
