#!/usr/bin/env python3
"""Phase 2c: court-scoped score saving through save_court_scores, organizer-driven round advance, season rollover control."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)

# Single game save → database function (validates target, no ties, court membership, current round)
rep("""  const key=`c${court}_y${cy}_g${gameNum}`;
  S.current.scores[key]={a1:combo.a1,a2:combo.a2,b1:combo.b1,b2:combo.b2,sA:sa,sB:sb,w:sa>sb?'A':sb>sa?'B':'T'};
  // Invalidate any previously-recorded toss for this court/round — the score change
  // may have resolved the tie differently or shifted which players are tied, making
  // the recorded toss stale. Mirrors the behavior in saveScores (bulk save).
  if(S.current.preTosses){
    delete S.current.preTosses[`${cy}_c${court}_top`];
    delete S.current.preTosses[`${cy}_c${court}_bot`];
  }
  await setKV('current_session',S.current);
  renderScoreEntry();renderRoundTracker();renderLeaderboard();toast(`Game ${gameNum} saved!`,'success');""",
"""  const key=`c${court}_y${cy}_g${gameNum}`;
  const entry={a1:combo.a1,a2:combo.a2,b1:combo.b1,b2:combo.b2,sA:sa,sB:sb,w:sa>sb?'A':'B'};
  if(!(await persistCourtScores(court,cy,{[key]:entry})))return;
  renderScoreEntry();renderRoundTracker();renderLeaderboard();toast(`Game ${gameNum} saved!`,'success');""")
rep("""  S.lastUndo={court,cy,keys:entries.map(e=>`c${court}_y${cy}_g${e.g}`)};
  entries.forEach(e=>S.current.scores[`c${court}_y${cy}_g${e.g}`]=e);
  // When scores change, any previously-recorded toss for this court/round must be invalidated
  if(S.current.preTosses){
    delete S.current.preTosses[`${cy}_c${court}_top`];
    delete S.current.preTosses[`${cy}_c${court}_bot`];
  }
  await setKV('current_session',S.current);""",
"""  S.lastUndo={court,cy,keys:entries.map(e=>`c${court}_y${cy}_g${e.g}`)};
  const payload={};entries.forEach(e=>{payload[`c${court}_y${cy}_g${e.g}`]={a1:e.a1,a2:e.a2,b1:e.b1,b2:e.b2,sA:e.sA,sB:e.sB,w:e.w};});
  if(!(await persistCourtScores(court,cy,payload))){if(btn){btn.disabled=false;btn.innerHTML='💾 Save All Court '+court+' Scores';}return;}""")
rep("""async function saveGameScore(court,gameNum){""",
"""// Scores are written by the database function: only players on that court (or the organizer),
// only for the current round, only finished games. The returned version keeps our copy current.
async function persistCourtScores(court,cy,scores){
  try{
    const v=await rpc('save_court_scores',{p_court:court,p_cycle:cy,p_scores:scores,p_expected:_stateVersion['current_session']||null});
    Object.assign(S.current.scores,scores);_stateVersion['current_session']=v;
    if(S.current.preTosses){delete S.current.preTosses[`${cy}_c${court}_top`];delete S.current.preTosses[`${cy}_c${court}_bot`];}
    return true;
  }catch(e){
    if(e.code==='40001'||/Stale state|round is over/.test(e.message||'')){toast('⚠️ '+e.message+' — reloading','warn');await loadAll();renderAll();}
    else toast('Score not saved: '+(e.message||'refresh and retry'),'error');
    return false;
  }
}
async function saveGameScore(court,gameNum){""")
# Auto-advance is an organizer action: a player finishing the last court sees a waiting notice instead.
rep("""  if(!allCourtsDone())return;
  _autoAdvancing=true;""","""  if(!allCourtsDone())return;
  if(!adminUnlocked){toast('All courts are done — waiting for Christy to advance the round','info');return;}
  _autoAdvancing=true;""")
# Season rollover control in the organizer's danger zone
rep("""        <button class="btn btn-danger" onclick="hardReset()">Full Reset — Wipe All Data</button>""",
"""        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Start a new season: archives every completed session and player statistic under a label, resets season wins/losses/games/no-shows, and asks every player to register and sign again. Courts and ratings history are kept.</div>
        <input class="inp" id="new-season-label" placeholder="Archive label, e.g. 2025-26">
        <button class="btn btn-warn" onclick="startNewSeason()">📦 Archive season and start fresh</button>
        <div style="height:10px;"></div>
        <button class="btn btn-danger" onclick="hardReset()">Full Reset — Wipe All Data</button>""")
rep("""async function hardReset(){""","""async function startNewSeason(){
  const label=(document.getElementById('new-season-label')?.value||'').trim();
  if(label.length<3)return toast('Enter an archive label (for example 2025-26)','warn');
  if(S.current)return toast('End the active session first','warn');
  if(!confirm(`Archive the finished season as "${label}" and reset season statistics? Every player must register again for the new season.`))return;
  try{const r=await rpc('start_new_season',{p_label:label});toast(`Archived ${r.archived}; ${r.players_reset} players reset`,'success');await loadAll();renderAll();}
  catch(e){toast('Not started: '+(e.message||'refresh and retry'),'error');}
}
async function hardReset(){""")
p.write_text(s); print("patched")
