# p94 (September 22, 2026): the board's player chip fits a 320-pixel phone.
#  p93 added the two numbers the organizer decides on — wins and points scored — to every chip on the court board.
#  The chip is a flex row inside a two-column grid, so on a 320-pixel screen it became name + record + court selector
#  in about 145 pixels, and the selector ran off the side of the page (caught by the phone reflow check at 320px,
#  which requires that nothing reaches past the viewport).
#  The chip now wraps: the name and the record share the top line, and the court selector takes the line below at the
#  chip's own width. Nothing overflows, and the board reads the same on a laptop.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub(""".dnd-player:active{cursor:grabbing;opacity:0.7;}""",
    """.dnd-player{flex-wrap:wrap;gap:4px;}                 /* p94: three things in a narrow column need a second line */
.dnd-player .dnd-rec{flex:0 0 auto;}
.dnd-player .inp{flex:1 1 100%;min-width:0;max-width:100%;margin:0;}  /* min-width:0 or a select refuses to shrink */
.dnd-player:active{cursor:grabbing;opacity:0.7;}""")

f.write_text(s)
print("p94 applied")
