# p84 (September 20, 2026): the rating arrow measures the night, not a change of starting line.
#  From the organizer: "why its showing up arrow 99? I started with 1500 and lost 1 point it should be down arrow with
#  1 point right? Also Cindy's starting was how much? she won 4 games, and still lost -87 points."
#  Why it happened: the arrow was `computeEloRatings(all sessions) - computeEloRatings(all but the last)`, and
#  computeEloRatings SEEDS every player from the court they first played on in the list it is given. Dropping the last
#  session drops that evidence, so the "before" number was re-seeded from the player's ladder court instead — a
#  different starting line. The subtraction then reported the gap between two starting lines as if it were the night's
#  play: Christy seeded at 1500 (Court 1, first round) against a "before" of 1400 (ladder Court 2) read +99 for a night
#  that cost him 1 point; Cindy, seeded 1400 by her Round 1 Court 2 against a "before" of 1500, read -87 for a night
#  that earned her points. Both numbers were arithmetic between baselines, not results.
#  A round can move a rating by at most 32 (K=32), so a two-round night can never legitimately show 87 or 99.
#  Now the seeding is taken from the whole season once, and only the ROUNDS PLAYED are limited when measuring
#  "before this session" — one starting line, so the difference is the play and nothing else.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# A player who played but has no ladder court yet — a spare called in mid-session, before End Session writes the
# courts — was never seeded, so the season's rounds gave them a rating out of nowhere and the "before" reading had
# nothing to subtract: their arrow read 0 however the night went. Seed everyone the season's scores name.
sub("""  const rating=id=>elo[id]??1000;""",
    """  // p84: the scores are the last word on who played. A spare called in tonight has no ladder court yet; seed them
  // from the court they were called onto, so their arrow measures their night like everyone else's.
  Object.keys(firstCourt).forEach(id=>{if(elo[id]===undefined)elo[id]=1500-((firstCourt[id]-1)*100);});
  const rating=id=>elo[id]??1000;""")

# The seeding always comes from the full list; applyCount limits how many of those sessions are played out.
sub("""function computeEloRatings(sessList){""",
    """function computeEloRatings(sessList,applyCount){ // p84: applyCount limits the rounds played, never the seeding""")
sub("""  // Every completed session, then the live one, round by round in order. Ratings are frozen within a round.
  const allSess=seasonSess; // p76""",
    """  // Every completed session, then the live one, round by round in order. Ratings are frozen within a round.
  // p84: applyCount plays out only the first N sessions. The seeding above still reads the whole season, so a rating
  // taken "before the last session" stands on the same starting line as the rating taken after it.
  const allSess=applyCount===undefined?seasonSess:seasonSess.slice(0,Math.max(0,applyCount)); // p76, p84""")
# The arrow: same list, same seeding, one session's rounds fewer.
sub("""  const now=computeEloRatings(sess),before=computeEloRatings(sess.slice(0,-1));""",
    """  const now=computeEloRatings(sess),before=computeEloRatings(sess,sess.length-1); // p84: one baseline, one night""")

f.write_text(s)
print("p84 applied")
