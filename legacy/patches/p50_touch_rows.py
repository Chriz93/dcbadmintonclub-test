# p50 (September 12, 2026): on touch screens every checkbox and radio row is a 44px target.
#  - The waiver's "Who is accepting?" choices were 24px and 42px tall on a phone (found by the new phone waiver tests);
#    p39's 44px rule covered buttons and toggles but not these rows. Each row now has a 44px minimum height on a
#    touch screen, with the control centred on its text.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub(""".chk-row input{width:22px;height:22px;}}""", """.chk-row input{width:22px;height:22px;margin-top:0;}.chk-row{min-height:44px;align-items:center;}}""")
f.write_text(s)
print("p50 applied")
