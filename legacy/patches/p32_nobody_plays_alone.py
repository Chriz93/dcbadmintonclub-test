# p32 (September 11, 2026): nobody is seated alone, and the Home rules card lists the scoring and late-arrival rules.
#  - Seating with fewer than 24 playing filled courts four at a time, so 21, 17, 13, 9 or 5 players left ONE player alone
#    on the last court (no game possible). That player now joins the court above as its fifth player (five games to 15),
#    as the written rules already do for extras beyond 24. Two or three left over still play singles, as the
#    registration rules say. Used by Start Session, the next-week preview and both Re-sort buttons.
#  - Home rules card: games end at the target (21, or 15 on a court of five), no deuce; more than 5 minutes late moves
#    you to the last court — both already in the registration rules, now also on Home.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""// Courts hold four; with more than 24 playing, the extras become a fifth player on the bottom courts (Court 6, then 5, then 4…).
function courtSizes(n){const s={};for(let c=1;c<=NC;c++)s[c]=0;if(n<=NC*4){for(let c=1;c<=NC&&n>0;c++){s[c]=Math.min(4,n);n-=s[c];}}""",
    """// Courts hold four; with more than 24 playing, the extras become a fifth player on the bottom courts (Court 6, then 5, then 4…).
// With fewer, courts fill four at a time; a single leftover joins the court above as its fifth player (two or three play singles).
function courtSizes(n){const s={};for(let c=1;c<=NC;c++)s[c]=0;if(n<=NC*4){let last=0;for(let c=1;c<=NC&&n>0;c++){s[c]=Math.min(4,n);n-=s[c];last=c;}if(last>1&&s[last]===1){s[last-1]++;s[last]=0;}}""")
sub("""the extra players become a fifth player on the bottom courts — Court 6 first, then Court 5, then Court 4. A court of five plays five doubles games to <strong>15 points</strong> and each player sits out one; a court of four plays three games to 21.<br>""",
    """the extra players become a fifth player on the bottom courts — Court 6 first, then Court 5, then Court 4. With fewer than 24, nobody plays alone: a single leftover player joins the last court in use as its fifth player, and a court left with two or three plays singles. A court of five plays five doubles games to <strong>15 points</strong> and each player sits out one; a court of four plays three games to 21.<br>
      • Games end at the target: first to 21 (15 on a court of five) wins, even at 20–20 — no deuce. Arrive 5 minutes early; more than 5 minutes late moves you to the last court.<br>""")
sub("""3 players play 3 singles games; 2 players play best-of-3 singles. When more than 24 play,""",
    """3 players play 3 singles games; 2 players play best-of-3 singles. Nobody plays alone: a single leftover player joins the last court in use as a fifth player. When more than 24 play,""")
f.write_text(s)
print("p32 applied")
