#!/usr/bin/env python3
"""Phase 2g: one definition of the upcoming session (active night, else the first un-played date) shared by Home,
the vote card, RSVP loading and the attendance tab; voting opens before the organizer starts the night."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)

rep("function leaderboardPlayers(){", """// The session everyone is preparing for: the active night, else the next un-played date (never past the season).
function upcomingSessionNumber(){if(S.current)return S.current.number;return Math.min(S.sessions.length+1,DATES.length);}
function seasonComplete(){return !S.current&&S.sessions.length>=DATES.length;}
function leaderboardPlayers(){""")

# RSVP: vote for the upcoming session whether or not the organizer has started it.
rep("""async function submitRSVP(coming){
  if(!S.current) return toast('No active session', 'warn');
  const me=myPlayer();""","""async function submitRSVP(coming){
  if(seasonComplete()) return toast('The season is complete', 'warn');
  const me=myPlayer();""")
rep("await rpc('set_rsvp',{p_session:S.current.number,p_player:me.id,p_response:response});","await rpc('set_rsvp',{p_session:upcomingSessionNumber(),p_player:me.id,p_response:response});")
rep("""  if(compact&&(!userRegistered||!S.current)){el.innerHTML='';return;}
  if(!S.current){
    el.innerHTML = '<div class="alert alert-warn">No active session</div>';
    return;
  }""","""  if(compact&&(!userRegistered||seasonComplete())){el.innerHTML='';return;}
  if(seasonComplete()){
    el.innerHTML = '<div class="alert alert-success">Season complete — thank you for playing!</div>';
    return;
  }
  const sessNo=upcomingSessionNumber();""")
rep("""  let html = compact?'':`<div class="alert alert-info">📋 RSVP for Session ${S.current.number}</div>`;
  html += `<div class="card"><div class="card-title">🗳️ Vote: are you playing Session ${S.current.number} (${DATES[S.current.number-1]||''})?</div>""",
"""  let html = compact?'':`<div class="alert alert-info">📋 RSVP for Session ${sessNo}${S.current?' (tonight)':''}</div>`;
  html += `<div class="card"><div class="card-title">🗳️ Vote: are you playing Session ${sessNo} (${DATES[sessNo-1]||''})?</div>""")
rep("  const startAt=FD[S.current.number-1];","  const startAt=FD[sessNo-1];")
rep("""    if(S.current){
      S.votes=await getKV(`votes_session_${S.current.number}`)||{};
      const rows=await sbG('rsvps',`session_number=eq.${S.current.number}&select=player_id,response,updated_at&order=updated_at.asc`);
      S.rsvp={};(rows||[]).forEach(r=>{S.rsvp[r.player_id]=r.response;});
    }else S.rsvp={};""","""    {
      const sessNo=upcomingSessionNumber();
      S.votes=S.current?(await getKV(`votes_session_${sessNo}`)||{}):{};
      const rows=await sbG('rsvps',`session_number=eq.${sessNo}&select=player_id,response,updated_at&order=updated_at.asc`);
      S.rsvp={};(rows||[]).forEach(r=>{S.rsvp[r.player_id]=r.response;});
    }""")

# Home: the hero and countdown follow the upcoming session, not the calendar alone.
rep("""  let ni=FD.findIndex(d=>d>now);if(ni===-1)ni=DATES.length-1;
  const nd=document.getElementById('next-date');
  if(nd)nd.textContent=S.sessions.length>=DATES.length?'Season Complete! 🎉':`Session ${ni+1} — ${DATES[ni]}`;""",
"""  const ni=upcomingSessionNumber()-1;
  const nd=document.getElementById('next-date');
  if(nd)nd.textContent=seasonComplete()?'Season Complete! 🎉':`Session ${ni+1} — ${DATES[ni]}${S.current?' · in progress':''}`;""")

# Attendance tab: show each player's vote beside the present/absent buttons, and the real court capacity.
rep("""      <div style="font-size:11px;font-weight:800;color:${cls};margin-bottom:6px;">Court ${c} (${courtPids.length}/4)</div>`;
    courtPids.forEach(id=>{
      const p=S.players.find(x=>x.id===id);if(!p)return;
      const status=att[id]||'';
      html+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="flex:1;font-size:12px;font-weight:700;">${esc(p.name.split(' ')[0])}</span>""",
"""      <div style="font-size:11px;font-weight:800;color:${cls};margin-bottom:6px;">Court ${c} (${courtPids.length}/${courtCap(c)})</div>`;
    courtPids.forEach(id=>{
      const p=S.players.find(x=>x.id===id);if(!p)return;
      const status=att[id]||'';
      const vote=(S.rsvp||{})[id];
      const voteTag=vote==='coming'?'<span class="tag tg-green" style="font-size:9px;">voted in</span>':vote==='notcoming'?'<span class="tag tg-red" style="font-size:9px;">voted out</span>':'<span class="tag tg-gray" style="font-size:9px;">no vote</span>';
      html+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="flex:1;font-size:12px;font-weight:700;">${esc(p.name.split(' ')[0])} ${voteTag}</span>""")
p.write_text(s); print("patched")
