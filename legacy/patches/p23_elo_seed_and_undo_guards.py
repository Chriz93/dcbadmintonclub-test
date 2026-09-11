#!/usr/bin/env python3
"""Phase 11b. Elo seeds from the court a player first played on (the peak court handed climbers a retroactive +100).
Round auto-advance only takes an undo checkpoint when it is really going to rotate. A step that changed nothing is
reported as such instead of undoing something else."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new):
    global s
    assert old in s, "anchor missing: " + old[:70]
    s = s.replace(old, new, 1)
rep("""  // Start from the seeding court (peak court reached, else current, else bottom): 1500 on Court 1 down to 1000 on Court 6.
  const elo={};
  leaderboardPlayers().forEach(p=>{
    let startCourt;
    if(p.highestCourt&&p.highestCourt>0&&p.highestCourt<=NC)startCourt=p.highestCourt;
    else if(p.currentCourt>0)startCourt=p.currentCourt;
    else startCourt=NC;
    elo[p.id]=1500-((startCourt-1)*100);
  });""",
"""  // Start from the court each player first played on this season: 1500 on Court 1 down to 1000 on Court 6.
  // Players who have not played yet start from their current court. (Seeding from the peak court instead would hand
  // every climber a retroactive +100 on top of the rating they earned by winning.)
  const elo={};
  const seasonSess=[...(S.sessions||[])].filter(Boolean);if(S.current)seasonSess.push(S.current);
  const firstCourt={};
  seasonSess.forEach(sess=>{
    Object.keys(sess.scores||{}).map(k=>{const m=k.match(/^c(\\d+)_y(\\d+)_g/);return m?{k,c:+m[1],y:+m[2]}:null;}).filter(Boolean)
      .sort((a,b)=>a.y-b.y||a.c-b.c).forEach(({k,c})=>{const sc=sess.scores[k];[sc.a1,sc.a2,sc.b1,sc.b2].forEach(id=>{if(id!=null&&firstCourt[id]===undefined)firstCourt[id]=c;});});
  });
  leaderboardPlayers().forEach(p=>{
    const startCourt=firstCourt[p.id]||(p.currentCourt>0&&p.currentCourt<=NC?p.currentCourt:NC);
    elo[p.id]=1500-((startCourt-1)*100);
  });""")
rep("Elo rating. Everyone starts from their court (Court 1 = 1500", "Elo rating. Everyone starts from the court they first played on this season (Court 1 = 1500")
rep("      if(!adminUnlocked||_ckDepth>0||_undoing)return orig.apply(this,args);",
    "      if(!adminUnlocked||_ckDepth>0||_undoing)return orig.apply(this,args);\n"
    "      if(name==='autoAdvanceCheck'&&!(S.current&&!S.current.completed&&allCourtsDone()))return orig.apply(this,args); // runs after every score save; only a real rotation is a step")
rep("    const r=await rpc('undo_last');\n",
    "    const r=await rpc('undo_last');\n"
    "    if(r&&r.skipped){await loadAll();renderAll();toast(`“${r.skipped}” changed nothing, so there was nothing to reverse`,'info');return;}\n")
p.write_text(s); print("patched")
