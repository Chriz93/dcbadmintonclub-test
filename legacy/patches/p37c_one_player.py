# p37c (September 12, 2026): Start Session with exactly one player coming is refused (a game needs at least two), the
# same way more than thirty is refused. Before, that player was seated alone on Court 1.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""function seatingProblem(n){return n>NC*5?`${n} players are coming, but the ${NC} courts seat at most ${NC*5}. Mark someone absent or not coming, then start the session.`:'';}""",
    """function seatingProblem(n){return n>NC*5?`${n} players are coming, but the ${NC} courts seat at most ${NC*5}. Mark someone absent or not coming, then start the session.`:n===1?'Only one player is coming — a game needs at least two. Start the session when another player is coming.':'';}""")
f.write_text(s)
print("p37c applied")
