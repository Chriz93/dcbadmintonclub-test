#!/usr/bin/env python3
"""Phase 2e bug fixes: derived statistics (no double counting), absent demotion from the assigned court,
proper doubles Elo, $400/$20 fees everywhere, zoom allowed, refund cutoff on the vote card."""
import pathlib, re
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)
def rep_all(old, new):
    global s
    n = s.count(old); assert n, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new); return n

# ── Statistics are rebuilt server-side from stored scores after every state change ─────────────
rep("""async function deleteKV(k){await rpc('delete_state',{k});delete _stateVersion[k];}""",
"""async function deleteKV(k){await rpc('delete_state',{k});delete _stateVersion[k];}
// Season wins/losses/games are derived from the stored scores by the database; never incremented in the browser.
async function rebuildStats(){try{await rpc('rebuild_player_stats');}catch(e){toast('Statistics not rebuilt: '+(e.message||'refresh and retry'),'error');}}""")
n = rep_all("await setKV('current_session',S.current);await loadAll();renderAll();","await setKV('current_session',S.current);await rebuildStats();await loadAll();renderAll();")
assert n >= 5, n
rep("""  // Update DB with actual games played this cycle per player
  const rotationStatUpdates=[];
  Object.entries(wins).forEach(([id,w])=>{
    const pid=parseInt(id);
    const p=S.players.find(x=>x.id===pid);
    if(!p)return;
    const played=gamesPlayedCycle[pid]||0;
    if(played===0)return; // player had no games this cycle (absent)
    rotationStatUpdates.push(sbU('players',pid,{season_wins:p.seasonWins+w,season_losses:p.seasonLosses+(played-w),games_played:p.gamesPlayed+played}));
  });
  if(rotationStatUpdates.length) await Promise.all(rotationStatUpdates);
}""","""  // Statistics are rebuilt from stored scores once the session state is saved (see rebuildStats).
  void gamesPlayedCycle;
}""")
rep("""  if(!alreadyProcessed){
    const statUpdates=[];
    Object.entries(finalWins).forEach(([id,w])=>{
      const pid=parseInt(id);
      const p=S.players.find(x=>x.id===pid);
      if(!p)return;
      const played=finalGamesPlayed[pid]||0;
      if(played===0)return;
      statUpdates.push(sbU('players',pid,{season_wins:p.seasonWins+w,season_losses:p.seasonLosses+(played-w),games_played:p.gamesPlayed+played}));
    });
    if(statUpdates.length) await Promise.all(statUpdates);
  }""","""  // Final-round statistics are rebuilt from the saved session below; nothing is incremented here.""")
rep("""  await setKV('completed_sessions',[...S.sessions,JSON.parse(JSON.stringify(S.current))]);
  await setKV('current_session',null);
  await loadAll();renderAll();""","""  await setKV('completed_sessions',[...S.sessions,JSON.parse(JSON.stringify(S.current))]);
  await deleteKV('current_session');
  await rebuildStats();
  await loadAll();renderAll();""")
rep("""  // Revert player DB stats
  const reverts=snap.playerStats.map(ps=>sbU('players',ps.id,{season_wins:ps.w,season_losses:ps.l,games_played:ps.gp}));
  if(reverts.length)await Promise.all(reverts);
  await setKV('current_session',S.current);
  await setKV('round_snapshots',_roundSnapshots);
  await loadAll();renderAll();""","""  await setKV('current_session',S.current);
  await setKV('round_snapshots',_roundSnapshots);
  await rebuildStats(); // statistics follow the restored scores/movements
  await loadAll();renderAll();""")
rep("""    const resets=activePlayers().map(p=>sbU('players',p.id,{season_wins:rebuilt[p.id].w,season_losses:rebuilt[p.id].l,games_played:rebuilt[p.id].gp}));
    if(resets.length)await Promise.all(resets);
    S.current.cycle=1;""","""    void rebuilt; // statistics are rebuilt from completed sessions after the reset is saved
    S.current.cycle=1;""")

# ── Absent players are demoted from the court they were assigned to, not from a cached value ─────
rep("""      const newCount=(p.noShowCount||0)+1;
      const demotedCourt=Math.min(NC, (p.currentCourt||1)+1);
      demotionUpdates.push(sbU('players',id,{no_show_count:newCount, current_court:demotedCourt}));
      toast(`⚠️ ${p.name} absent — court moved C${p.currentCourt}→C${demotedCourt} next session`,'warn');""",
"""      const newCount=(p.noShowCount||0)+1;
      let fromCourt=0;for(let c=1;c<=NC;c++)if((S.current.assignments[c]||[]).includes(id)){fromCourt=c;break;}
      if(!fromCourt)fromCourt=p.currentCourt||NC;
      const demotedCourt=Math.min(NC, fromCourt+1);
      demotionUpdates.push(sbU('players',id,{no_show_count:newCount, current_court:demotedCourt}));
      toast(`⚠️ ${p.name} absent — court moved C${fromCourt}→C${demotedCourt} next session`,'warn');""")

# ── Elo: team-average expected score, K=32, mean change per round (3- and 4-game rounds weigh the same) ─
start = s.index("function computeEloRatings(){"); end = s.index("function renderRankings(){")
s = s[:start] + r"""function computeEloRatings(){
  // Start from the seeding court (peak court reached, else current, else bottom): 1500 on Court 1 down to 1000 on Court 6.
  const elo={};
  leaderboardPlayers().forEach(p=>{
    let startCourt;
    if(p.highestCourt&&p.highestCourt>0&&p.highestCourt<=NC)startCourt=p.highestCourt;
    else if(p.currentCourt>0)startCourt=p.currentCourt;
    else startCourt=NC;
    elo[p.id]=1500-((startCourt-1)*100);
  });
  const rating=id=>elo[id]??1000;
  // Every completed session, then the live one, round by round in order. Ratings are frozen within a round.
  const allSess=[...(S.sessions||[])].filter(Boolean);
  if(S.current)allSess.push(S.current);
  allSess.forEach(sess=>{
    const cycles=new Set();
    Object.keys(sess.scores||{}).forEach(k=>{const m=k.match(/_y(\d+)_/);if(m)cycles.add(parseInt(m[1]));});
    [...cycles].sort((a,b)=>a-b).forEach(cy=>{
      const sum={},cnt={};
      Object.entries(sess.scores).forEach(([k,sc])=>{
        if(!k.includes(`_y${cy}_`)||!sc||(sc.w!=='A'&&sc.w!=='B'))return;
        const A=[sc.a1,sc.a2].filter(x=>x!=null),B=[sc.b1,sc.b2].filter(x=>x!=null);
        if(!A.length||!B.length)return;
        const ra=A.reduce((t,id)=>t+rating(id),0)/A.length,rb=B.reduce((t,id)=>t+rating(id),0)/B.length;
        const ea=1/(1+Math.pow(10,(rb-ra)/400));
        A.forEach(id=>{sum[id]=(sum[id]||0)+((sc.w==='A'?1:0)-ea);cnt[id]=(cnt[id]||0)+1;});
        B.forEach(id=>{sum[id]=(sum[id]||0)+((sc.w==='B'?1:0)-(1-ea));cnt[id]=(cnt[id]||0)+1;});
      });
      Object.keys(sum).forEach(id=>{elo[id]=rating(id)+32*(sum[id]/cnt[id]);});
    });
  });
  Object.keys(elo).forEach(id=>{elo[id]=Math.round(elo[id]);});
  return elo;
}
""" + s[end:]

# ── Fees: $400 season, $20 spare session ────────────────────────────────────────────────────────
n = rep_all("$150", "$400")
assert n >= 8, n
rep("""<option value="regular">🏸 Regular ($400/season)</option>""","""<option value="regular">🏸 Regular ($400/season)</option>""")

# ── Phones may zoom; the layout already scales ───────────────────────────────────────────────────
rep("""<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">""",
    """<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">""")

# ── Vote card shows the 72-hour refund cutoff for the session being voted on ─────────────────────
rep("""  if(me){
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">""",
"""  const startAt=FD[S.current.number-1];
  if(startAt){
    const cutoff=new Date(startAt.getTime()-FEES.absenceNoticeHours*3600000);
    const open=Date.now()<=cutoff.getTime();
    html += `<div style="font-size:11px;color:${open?'var(--muted)':'var(--yellow2)'};margin-bottom:8px;">${open?`$${FEES.absenceRefund} refund if you decline by ${cutoff.toLocaleString('en-CA',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} (72 hours before play).`:`The 72-hour refund window closed ${cutoff.toLocaleString('en-CA',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}; you can still update your answer.`}</div>`;
  }
  if(me){
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">""")
p.write_text(s); print("patched")
