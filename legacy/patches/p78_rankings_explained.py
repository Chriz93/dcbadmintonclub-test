# p78 (September 18, 2026): the Rankings tab explains how a rating moves, so the organizer does not have to.
#  From the organizer: "yes add that to rankings tab … explain me clearly ELO calculation, does the loosing in a lower
#  court reduce more points?" — it does not: the court plays no part, only the ratings across the net. The tab now says
#  so, with the figures a player can check against their own night.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""    <div style="font-size:11px;color:var(--muted);margin-bottom:10px;">Elo rating. Everyone starts from the court they first played on this season (Court 1 = 1500 … Court 6 = 1000). Each round, beating a stronger pair earns more than beating a weaker one, and losses cost the same the other way (K = 32). A lower-court player can out-rank a higher-court player through consistent wins.</div>""",
    """    <div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.55;">
      Everyone starts from the court they first played on this season (Court 1 = 1500 … Court 6 = 1000).
      <div style="margin-top:6px;"><strong>Your rating moves once a round, not once a game.</strong> The round's games are
      averaged, then: <em>new rating = old + 32 × (how much better you did than expected)</em>. Winning a game counts 1,
      losing counts 0, and what is expected comes from the two pairs' average ratings — so the score in points does not
      change your rating, only who won.</div>
      <div style="margin-top:6px;">Against opponents rated about the same as you, winning every game in a round is about
      <span style="color:var(--green2);font-weight:700;">+16</span> and losing every game about
      <span style="color:var(--red2);font-weight:700;">−16</span>. The gap decides the rest: beat a pair rated 200 above
      you and a clean round is about +24; lose to a pair rated 200 below you and it is about −24. A split round lands in
      between — two wins and a loss is roughly +5.</div>
      <div style="margin-top:6px;"><strong>The court you play on does not change the maths.</strong> Only the ratings
      across the net do. On Court 6, where everyone is rated alike, losing a round still costs about 16 — the same as on
      Court 1. Large swings happen only when a much higher-rated player loses to a much lower-rated pair, or the other
      way round. That is how a lower-court player can out-rank a higher-court one by winning consistently.</div>
    </div>""")

f.write_text(s)
print("p78 applied")
