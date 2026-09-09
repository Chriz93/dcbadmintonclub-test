#!/usr/bin/env python3
"""Phase 2f integration fixes: every tab reads the same season data (dates carry the year, fees/capacity from
constants, per-round game counts from stored scores, frozen names in history, honest Elo description)."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)

# Dates already include the year ("Sep 15, 2026"); a second year was being appended in four places.
rep("${S.current?S.current.date+', 2026':'Tonight'}", "${S.current?S.current.date:'Tonight'}")
rep("Session ${s.number} — ${s.date}, 2026 · ${rndCount} Rounds · Final Standings", "Session ${s.number} — ${s.date} · ${rndCount} Rounds · Final Standings")
rep("""<div style="font-weight:800;">Session ${s.number} — ${s.date}, 2026</div>""", """<div style="font-weight:800;">Session ${s.number} — ${s.date}</div>""")
rep("doc.text(`Session ${s.number} — ${s.date}, 2026 · ", "doc.text(`Session ${s.number} — ${s.date} · ")
rep("""<div class="page-sub">Season · Apr 7 – May 26, 2026</div>""", """<div class="page-sub">Season 2026–27 · Sep 15, 2026 – May 18, 2027</div>""")

# Fees and capacity come from the season constants everywhere.
rep("const regPaidAmt=ap_.filter(p=>p.paid&&p.membershipType!=='spare').length*150;", "const regPaidAmt=ap_.filter(p=>p.paid&&p.membershipType!=='spare').length*FEES.regularSeason;")
rep("Regular Members (${regulars.length}/24)", "Regular Members (${regulars.length}/${REGULAR_CAPACITY})")
rep("$${regPaid*150}</div>", "$${regPaid*FEES.regularSeason}</div>")

# Player of the Session: games come from the stored scores (the five-player court plays 5 games, not 3).
rep("""  // Calculate games played from wins data (each round = 3 games per player)
  Object.keys(playerWins).forEach(id=>{playerGames[id]=sess.movements.length*3;});""",
"""  // Games played come from the stored scores (five-player courts play 5 games a round, others 3).
  Object.values(sess.scores||{}).forEach(sc=>{[sc.a1,sc.a2,sc.b1,sc.b2].forEach(id=>{if(id!=null)playerGames[id]=(playerGames[id]||0)+1;});});""")

# Streaks: a player's games in a round are found by round key, whatever court they were on that round.
rep("""        let playerGames=0;
        for(let c=1;c<=NC;c++){
          const pids=s.assignments?.[c]||[];
          if(!pids.includes(p.id))continue;
          const numG=courtGames(pids.length);
          for(let g2=1;g2<=numG;g2++){
            const sc=s.scores?.[`c${c}_y${m.cycle}_g${g2}`];
            if(!sc)continue;
            const allIds=[sc.a1,sc.a2,sc.b1,sc.b2].filter(x=>x!=null);
            if(allIds.includes(p.id))playerGames++;
          }
        }""",
"""        let playerGames=0;
        Object.entries(s.scores||{}).forEach(([k,sc])=>{
          if(!k.includes(`_y${m.cycle}_`)||!sc)return;
          if([sc.a1,sc.a2,sc.b1,sc.b2].includes(p.id))playerGames++;
        });""")

# Game history of completed sessions uses the names frozen on the session record.
old = """          const sideANames=[sc.a1,sc.a2].filter(x=>x!=null).map(id=>S.players.find(x=>x.id===id)?.name.split(' ')[0]||'?').join(' & ');
          const sideBNames=[sc.b1,sc.b2].filter(x=>x!=null).map(id=>S.players.find(x=>x.id===id)?.name.split(' ')[0]||'?').join(' & ');"""
assert s.count(old) == 2, s.count(old)
i = s.rindex(old)
s = s[:i] + """          const sideANames=[sc.a1,sc.a2].filter(x=>x!=null).map(id=>sessPlayerName(s,id).split(' ')[0]).join(' & ');
          const sideBNames=[sc.b1,sc.b2].filter(x=>x!=null).map(id=>sessPlayerName(s,id).split(' ')[0]).join(' & ');""" + s[i+len(old):]

# The rankings card describes the rating that is actually computed.
rep("Performance-weighted rating: winning on higher courts earns more. A lower-court player CAN out-rank a higher-court player through consistent wins.",
    "Elo rating. Everyone starts from their court (Court 1 = 1500 … Court 6 = 1000). Each round, beating a stronger pair earns more than beating a weaker one, and losses cost the same the other way (K = 32). A lower-court player can out-rank a higher-court player through consistent wins.")
p.write_text(s); print("patched")
