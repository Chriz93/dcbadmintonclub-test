# p31 (September 11, 2026): the season rollover (database L15) also moves last season's payments to the organizer-only
# payment archive and clears the reminder log. The confirmation and the result message now say so.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""and reset season statistics? Every player must register again for the new season.`))return;""",
    """and reset season statistics? Every player must register again for the new season. Last season's payments move to the payment archive, so the Pay tab starts empty.`))return;""")
sub("""toast(`Archived ${r.archived}; ${r.players_reset} players reset`,'success');""",
    """toast(`Archived ${r.archived}; ${r.players_reset} players reset; ${r.payments_archived||0} payments archived`,'success');""")
f.write_text(s)
print("p31 applied")
