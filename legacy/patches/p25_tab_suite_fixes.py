# p25: bugs found by the generated per-tab suites.
#  1. Leaders / Stats counted the final round twice between its automatic rotation and End Session.
#  2. Courts: the fifth player on Court 6 was hidden in the gym and list views; counts read "5/4".
#  3. Cancel session wiped every earlier session's statistics; now only tonight is discarded and stats are rebuilt.
#  4. Waitlist "Promote" disappeared at 24 regulars instead of the 25-player capacity.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

# 1. A round is "live" only until it has been rotated into the season statistics.
sub("""  if(S.current){
    const cy=S.current.cycle;
    for(let c=1;c<=NC;c++){
      const pids=(S.current.assignments[c]||[]).filter(id=>S.players.find(p=>p.id===id));
      const numGames=courtGames(pids.length);""",
"""  if(S.current&&!roundRotated()){
    const cy=S.current.cycle;
    for(let c=1;c<=NC;c++){
      const pids=(S.current.assignments[c]||[]).filter(id=>S.players.find(p=>p.id===id));
      const numGames=courtGames(pids.length);""")
sub("""    if(S.current){
      const scy=S.current.cycle;""", """    if(S.current&&!roundRotated()){
      const scy=S.current.cycle;""")
sub("if(S.current){const cy2=S.current.cycle;for(let c=1;c<=NC;c++){for(let g2=1;g2<=MAXG;g2++){const sc=S.current.scores[`c${c}_y${cy2}_g${g2}`]",
    "if(S.current&&!roundRotated()){const cy2=S.current.cycle;for(let c=1;c<=NC;c++){for(let g2=1;g2<=MAXG;g2++){const sc=S.current.scores[`c${c}_y${cy2}_g${g2}`]")
sub("function leaderboardPlayers(){",
    "// True once the current round's results are in the season statistics (the final round rotates without opening a new one).\n"
    "function roundRotated(){return !!(S.current&&(S.current.movements||[]).some(m=>m.cycle===S.current.cycle));}\n"
    "function leaderboardPlayers(){")

# 2. Every player on a court is shown; the count reads 5/5 on a five-player Court 6.
sub("""      const cnt=players.length;
      const cntColor=cnt===4?'var(--green2)':cnt===0?'var(--muted)':'var(--yellow2)';""",
"""      const cnt=players.length;
      const cntColor=cnt>=4?'var(--green2)':cnt===0?'var(--muted)':'var(--yellow2)';
      const slots=Math.max(4,cnt),half=Math.ceil(slots/2);
      const topIdx=[...Array(half).keys()],botIdx=[...Array(slots-half).keys()].map(i=>i+half);""")
sub("""<span style="font-size:11px;font-weight:800;color:${cntColor};">${cnt}/4</span>""",
    """<span style="font-size:11px;font-weight:800;color:${cntColor};">${cnt}/${Math.max(4,cnt)}</span>""")
sub("""          ${[0,1].map(i=>{const p=players[i],mv=p?prevMv[p.id]:null;""", """          ${topIdx.map(i=>{const p=players[i],mv=p?prevMv[p.id]:null;""")
sub("""          ${[2,3].map(i=>{const p=players[i],mv=p?prevMv[p.id]:null;""", """          ${botIdx.map(i=>{const p=players[i],mv=p?prevMv[p.id]:null;""")
sub("""        <div class="court-players">${[0,1,2,3].map(i=>{""", """        <div class="court-players">${[...Array(Math.max(4,players.length)).keys()].map(i=>{""")
sub("""<div style="font-size:11px;color:${color};">${n}/4</div>""", """<div style="font-size:11px;color:${color};">${n}/${Math.max(4,n)}</div>""")
sub("""${cnt}/4${warn?` — need ${4-cnt}`:''}""", """${cnt}/${Math.max(4,cnt)}${warn?` — need ${4-cnt}`:''}""")

# 3. Cancelling tonight keeps every finished session's results.
sub("""  if(!confirm('Cancel session? All scores and stats from this session will be lost.'))return;
  // Reset ALL player stats (including benched/moved players, not just activePlayers)
  const allPlayerIds=new Set([...activePlayers().map(p=>p.id),...(S.current?Object.values(S.current.assignments).flat():[])]);
  const resets=S.players.filter(p=>allPlayerIds.has(p.id)).map(p=>sbU('players',p.id,{season_wins:0,season_losses:0,games_played:0,highest_court:p.currentCourt||0}));
  if(resets.length)await Promise.all(resets);
  await setKV('current_session',null);
  await loadAll();renderAll();toast('Session cancelled — all stats cleared','success');""",
"""  if(!confirm('Cancel tonight\\'s session? Its scores are removed; results from finished sessions are kept.'))return;
  // Season statistics are rebuilt from the finished sessions, so earlier weeks are untouched.
  await deleteKV('current_session');S.current=null;_roundSnapshots=[];_autoAdvancing=false;
  await rebuildStats();
  await loadAll();renderAll();toast('Session cancelled — earlier results kept','success');""")

# 4. Promote while there is room under the regular capacity.
sub("${regularCount<24?`<button class=\"btn btn-success btn-sm\" onclick=\"promoteFromWaitlist(",
    "${regularCount<REGULAR_CAPACITY?`<button class=\"btn btn-success btn-sm\" onclick=\"promoteFromWaitlist(")
# 5. Stats: per-player award icons follow the awards banner — none before the first session is finished.
sub("""    const awards=[];
    if(p.id===longestStreakId&&sd.maxStreak>0)awards.push('🔥');""", """    const awards=[];
    if(S.sessions.length>0){
    if(p.id===longestStreakId&&sd.maxStreak>0)awards.push('🔥');""")
sub("""    if(p.id===mostConsistentId)awards.push('🏅');
    // Include live round""", """    if(p.id===mostConsistentId)awards.push('🏅');
    }
    // Include live round""")
# 6. Courts between sessions shows next Tuesday's lineup — exactly what Start Session will seat — instead of stored courts,
#    where last week's decliners still held a seat (Court 1 could list six people).
sub("""async function startSession(){
  if(S.current)return toast('Session already active','warn');
  const n=S.sessions.length+1;if(n>DATES.length)return toast('All '+DATES.length+' sessions are done!','warn');
  const votes=S.rsvp||{};
  const declined=new Set(S.players.filter(p=>isRegularMember(p)&&votes[p.id]==='notcoming').map(p=>p.id));
  const confirmedSpares=spareSeats().claims.filter(c=>c.confirmed).map(c=>c.id);
  const initAssign=autoAssign(declined,confirmedSpares);""",
"""// Next session's seating from the votes: regulars who are not declining by earned court, then confirmed spares.
function upcomingLineup(){
  const votes=S.rsvp||{};
  const declined=new Set(S.players.filter(p=>isRegularMember(p)&&votes[p.id]==='notcoming').map(p=>p.id));
  const confirmedSpares=spareSeats().claims.filter(c=>c.confirmed).map(c=>c.id);
  return{votes,declined,confirmedSpares,assign:autoAssign(declined,confirmedSpares)};
}
async function startSession(){
  if(S.current)return toast('Session already active','warn');
  const n=S.sessions.length+1;if(n>DATES.length)return toast('All '+DATES.length+' sessions are done!','warn');
  const{votes,declined,confirmedSpares,assign:initAssign}=upcomingLineup();""")
sub("""  // When no session: show players on their ACTUAL DB courts (not auto-redistributed)
  let assignments;
  if(S.current){assignments=S.current.assignments;}
  else{assignments={};for(let c=1;c<=NC;c++)assignments[c]=[];activePlayers().forEach(p=>{if(p.currentCourt>=1&&p.currentCourt<=NC)assignments[p.currentCourt].push(p.id);});}""",
"""  // When no session: show next session's lineup from the votes (what Start Session will seat).
  const assignments=S.current?S.current.assignments:upcomingLineup().assign;""")

# 7. Late arrivals never push Court 6 past five players (six has no pairings, so the round could never finish).
sub("""  if(!originalCourt)return toast('Player not assigned','warn');
  const lastCourt=NC;""", """  if(!originalCourt)return toast('Player not assigned','warn');
  if(originalCourt!==NC&&(S.current.assignments[NC]||[]).length>=courtCap(NC))return toast(`Court ${NC} already has ${courtCap(NC)} players — use Remove Absent & Replace or Rebalance instead`,'warn');
  const lastCourt=NC;""")
# 8. Late arrivals are recorded on the session (the list was built on a detached array when nobody was late yet).
sub("""  const lat=S.current.latePlayers||[];
  if(lat.find(x=>x.playerId===pid))return toast('Already marked late','warn');""", """  if(!S.current.latePlayers)S.current.latePlayers=[];
  const lat=S.current.latePlayers;
  if(lat.find(x=>x.playerId===pid))return toast('Already marked late','warn');""")
# 9. A key that no longer exists forgets its cached version, so a device that saw a session ended elsewhere can start the next.
sub("""if(r&&r[0]){_stateVersion[k]=r[0].version||0;return JSON.parse(r[0].value);}return null;}catch(e){return null;}}""",
    """if(r&&r[0]){_stateVersion[k]=r[0].version||0;return JSON.parse(r[0].value);}delete _stateVersion[k];return null;}catch(e){return null;}}""")
# 10. Home countdown clears once play has started (it kept the last value it drew, e.g. "0 days 0 hours 1 min").
sub("""cd.innerHTML=`<div class="cd-box"><div class="cd-num">${days}</div><div class="cd-lbl">Days</div></div><div class="cd-box"><div class="cd-num">${hrs}</div><div class="cd-lbl">Hours</div></div><div class="cd-box"><div class="cd-num">${mins}</div><div class="cd-lbl">Mins</div></div>`;}}""",
    """cd.innerHTML=`<div class="cd-box"><div class="cd-num">${days}</div><div class="cd-lbl">Days</div></div><div class="cd-box"><div class="cd-num">${hrs}</div><div class="cd-lbl">Hours</div></div><div class="cd-box"><div class="cd-num">${mins}</div><div class="cd-lbl">Mins</div></div>`;}else cd.innerHTML='';}else if(cd)cd.innerHTML='';""")
# 11. After the 46-hour lock the confirmation no longer invites a change the buttons no longer allow.
sub("""${myRsvp === 'coming' ? '✅ You confirmed - See you there!' : '❌ Noted - Sit this one out'} · You can change your answer above.</div>`;""",
    """${myRsvp === 'coming' ? '✅ You confirmed - See you there!' : '❌ Noted - Sit this one out'}${locked?'':' · You can change your answer above.'}</div>`;""")
# 12. One count of taken regular places everywhere on the Registered tab: approved, self-registered regulars not on the
#     waitlist (the tab counted pending sign-ups too, so it could say "Slots Full" while approving would still allow it).
sub("""function renderRegPlayers(){""", """function regularPlacesTaken(exceptId){return S.players.filter(x=>x.membershipType!=='spare'&&!x.waitlisted&&x.approved&&x.sig&&x.sig!=='admin'&&x.id!==exceptId).length;}
function renderRegPlayers(){""")
sub("""  const regularCount=S.players.filter(p=>p.membershipType==='regular'&&!p.waitlisted&&p.sig&&p.sig!=='admin').length;
  const spareCount=""", """  const regularCount=regularPlacesTaken();
  const spareCount=""")
sub("""  const regularCount=S.players.filter(x=>x.membershipType==='regular'&&!x.waitlisted&&x.sig&&x.sig!=='admin').length;
  if(regularCount>=REGULAR_CAPACITY){toast('Still no open regular slots (25/25)','warn');return;}""",
    """  if(regularPlacesTaken(id)>=REGULAR_CAPACITY){toast('Still no open regular slots (25/25)','warn');return;}""")
# 13. Add Player uses the same count of taken regular places; the Players tab's 🚫 no longer claims success between sessions.
sub("""    const regularCount=S.players.filter(p=>p.membershipType==='regular'&&!p.waitlisted&&p.sig&&p.sig!=='admin').length;
    if(regularCount>=REGULAR_CAPACITY){toast('Regular slots full (25/25). Please choose Spare.','warn');return;}""",
    """    if(regularPlacesTaken()>=REGULAR_CAPACITY){toast('Regular slots full (25/25). Please choose Spare.','warn');return;}""")
sub("""  const p=S.players.find(x=>x.id===id);if(!p)return;
  if(!confirm(`Mark ${p.name} absent and move to bench?`))return;""", """  const p=S.players.find(x=>x.id===id);if(!p)return;
  if(!S.current)return toast('No session is running. For next Tuesday, set their vote to “not coming” in Standings → RSVP.','warn');
  if(!confirm(`Mark ${p.name} absent and move to bench?`))return;""")

# 14. Attendance marked before the session starts is honoured: absent = not seated (one court down next week), present =
#     seated even after a "not coming" vote. The marks are cleared once the session starts.
sub("""function upcomingLineup(){
  const votes=S.rsvp||{};
  const declined=new Set(S.players.filter(p=>isRegularMember(p)&&votes[p.id]==='notcoming').map(p=>p.id));
  const confirmedSpares=spareSeats().claims.filter(c=>c.confirmed).map(c=>c.id);
  return{votes,declined,confirmedSpares,assign:autoAssign(declined,confirmedSpares)};
}""", """function upcomingLineup(){
  const votes=S.rsvp||{},pre=S.current?{}:(S.preAttendance||{});
  const preAbsent=new Set(S.players.filter(p=>pre[p.id]==='absent').map(p=>p.id));
  const declined=new Set(S.players.filter(p=>isRegularMember(p)&&votes[p.id]==='notcoming'&&pre[p.id]!=='present'&&!preAbsent.has(p.id)).map(p=>p.id));
  const confirmedSpares=spareSeats().claims.filter(c=>c.confirmed).map(c=>c.id).filter(id=>!preAbsent.has(id));
  return{votes,pre,declined,preAbsent,confirmedSpares,assign:autoAssign(new Set([...declined,...preAbsent]),confirmedSpares)};
}""")
sub("""  const{votes,declined,confirmedSpares,assign:initAssign}=upcomingLineup();""", """  const{votes,pre,declined,preAbsent,confirmedSpares,assign:initAssign}=upcomingLineup();""")
sub("""  declined.forEach(id=>{attendance[id]='declined';});
  for(let c=1;c<=NC;c++)initAssign[c].forEach(id=>{if(votes[id]==='coming')attendance[id]='present';});""", """  declined.forEach(id=>{attendance[id]='declined';});
  const absentFrom={};
  preAbsent.forEach(id=>{const p=S.players.find(x=>x.id===id);if(p&&p.currentCourt>0&&!isSpareMember(p)){attendance[id]='absent';absentFrom[id]=p.currentCourt;}});
  for(let c=1;c<=NC;c++)initAssign[c].forEach(id=>{if(votes[id]==='coming'||pre[id]==='present')attendance[id]='present';});""")
sub("""completed:false,preTosses:{},attendance,absentFrom:{}};""", """completed:false,preTosses:{},attendance,absentFrom};""")
sub("""  await setKV('current_session',sess);await loadAll();renderAll();toast(`Session ${n} started — ${declined.size} excused, ${confirmedSpares.length} spare${confirmedSpares.length===1?'':'s'} seated`,'success');""",
    """  await setKV('current_session',sess);
  if(Object.keys(pre).length){await deleteKV('pre_session_attendance');S.preAttendance={};}
  await loadAll();renderAll();toast(`Session ${n} started — ${declined.size} excused${preAbsent.size?`, ${preAbsent.size} marked absent`:''}, ${confirmedSpares.length} spare${confirmedSpares.length===1?'':'s'} seated`,'success');""")
# 15. Assign board: a drop onto a full court is refused before anyone moves (the player used to vanish from the board and a
#     later save dropped them from the session); Court 6 holds five.
sub("""  // Remove from all courts
  for(let c=1;c<=NC;c++)a[c]=(a[c]||[]).filter(id=>id!==dragPid);
  // Add to target court (0 = unassigned, just remove)
  if(targetCourt>0){
    if(!a[targetCourt])a[targetCourt]=[];
    if(a[targetCourt].length>=4){toast('Court '+targetCourt+' is full (4/4)','warn');dragPid=null;renderAssignUI();return;}
    a[targetCourt].unshift(dragPid);
  }""", """  // Refuse a full court before moving anyone (Court 6 holds five)
  if(targetCourt>0&&(a[targetCourt]||[]).filter(id=>id!==dragPid).length>=courtCap(targetCourt)){toast(`Court ${targetCourt} is full (${courtCap(targetCourt)}/${courtCap(targetCourt)})`,'warn');dragPid=null;renderAssignUI();return;}
  // Remove from all courts
  for(let c=1;c<=NC;c++)a[c]=(a[c]||[]).filter(id=>id!==dragPid);
  // Add to target court (0 = unassigned, just remove)
  if(targetCourt>0){
    if(!a[targetCourt])a[targetCourt]=[];
    a[targetCourt].unshift(dragPid);
  }""")
# 16. Record-payment title shows names as written (openModal sets the title as text, so escaping showed "O&#39;Connor").
sub("""openModal(`Record payment — ${esc(p.name)}`""", """openModal(`Record payment — ${p.name}`""")

# 17. Restoring a snapshot brings the announcements back (only a retired "content" field was re-posted, so all were lost),
#     oldest first with their original times so the order is kept.
sub("""    for(const a of (snap.announcements||[])){
      const {id,created_at,...fields}=a;
      if(fields.content)await sbP('announcements',fields);
    }""", """    for(const a of [...(snap.announcements||[])].reverse()){
      const title=a.title||(a.content?'Notice':''),body=a.body||a.content||'';
      if(title||body)await sbP('announcements',{type:a.type||'info',title,body,created_at:a.created_at});
    }""")

# 18. A round that has already been rotated into the standings cannot be cleared (movements would point at missing scores).
sub("""async function clearCycleScores(){
  if(!S.current)return toast('No session','warn');""", """async function clearCycleScores(){
  if(!S.current)return toast('No session','warn');
  if(roundRotated())return toast('Round '+S.current.cycle+' is already in the standings — use Undo to go back instead','warn');""")
# 19. Regular places are counted from what every viewer can see: regulars (not waitlisted, not organizer-added) registered
#     this season. Players read the public list, which has no signature field, so the Register page always said
#     "25 spots left" and the full-league waitlist never triggered.
sub("""function regularPlacesTaken(exceptId){return S.players.filter(x=>x.membershipType!=='spare'&&!x.waitlisted&&x.approved&&x.sig&&x.sig!=='admin'&&x.id!==exceptId).length;}""",
    """function holdsRegularPlace(p){return !!p&&p.membershipType!=='spare'&&!p.waitlisted&&p.sig!=='admin'&&registeredThisSeason(p);}
function regularPlacesTaken(exceptId){return S.players.filter(x=>holdsRegularPlace(x)&&x.approved&&x.id!==exceptId).length;}
function regularPlacesClaimed(){return S.players.filter(holdsRegularPlace).length;} // sign-ups waiting for approval hold their place""")
sub("""  const regularCount=S.players.filter(p=>p.membershipType==='regular'&&!p.waitlisted&&p.sig&&p.sig!=='admin').length;
  const slotsEl=document.getElementById('reg-slots-text');""", """  const regularCount=regularPlacesClaimed();
  const slotsEl=document.getElementById('reg-slots-text');""")
sub("""    const regularCount=S.players.filter(p=>p.membershipType==='regular'&&!p.waitlisted&&p.sig&&p.sig!=='admin').length;
    if(regularCount>=REGULAR_CAPACITY){
      if(!confirm('Regular slots are FULL (25/25).""", """    const regularCount=regularPlacesClaimed();
    if(regularCount>=REGULAR_CAPACITY){
      if(!confirm('Regular slots are FULL (25/25).""")
# 20. Court detail matches the court card: next session's lineup between sessions, and every player (five on Court 6).
sub("""function showCourtDetail(court){
  let assignments;if(S.current){assignments=S.current.assignments;}else{assignments={};for(let c=1;c<=NC;c++)assignments[c]=[];activePlayers().forEach(p=>{if(p.currentCourt>=1&&p.currentCourt<=NC)assignments[p.currentCourt].push(p.id);});}""",
    """function showCourtDetail(court){
  const assignments=S.current?S.current.assignments:upcomingLineup().assign;""")
sub("""      ${[0,1,2,3].map(i=>{const p=players[i];
        return `<div style="background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Player ${i+1}</div>""", """      ${[...Array(Math.max(4,players.length)).keys()].map(i=>{const p=players[i];
        return `<div style="background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Player ${i+1}</div>""")
# 21. "🔒 Lock" really locks: organizer tools stay off on this device (even after a reload) until the authenticator code is
#     entered again. The next render used to unlock again at once for a verified session, so Lock did nothing.
sub("""let adminUnlocked=false;""", """let adminUnlocked=false;
let _adminManualLock=(()=>{try{return localStorage.getItem('dcbc-admin-locked')==='1';}catch(e){return false;}})();""")
sub("""function lockAdmin(){
  adminUnlocked=false;""", """function lockAdmin(){
  _adminManualLock=true;try{localStorage.setItem('dcbc-admin-locked','1');}catch(e){}
  adminUnlocked=false;""")
sub("""  document.getElementById('page-courts').classList.remove('admin-mode');
  renderAll();
}""", """  document.getElementById('page-courts').classList.remove('admin-mode');
  renderAll();prepareAdminLock();
}""")
sub("""  if(S_me.organizer&&S_me.verified&&!adminUnlocked){adminUnlocked=true;applyAdminUnlock();}""",
    """  if(S_me.organizer&&S_me.verified&&!adminUnlocked&&!_adminManualLock){adminUnlocked=true;applyAdminUnlock();}""")
sub("""  if(S_me.verified){adminUnlocked=true;applyAdminUnlock();return;}""", """  if(S_me.verified&&!_adminManualLock){adminUnlocked=true;applyAdminUnlock();return;}""")
sub("""    if(!S_me.verified)throw new Error('Verification was not accepted');
    document.getElementById('pin-inp').value='';""", """    if(!S_me.verified)throw new Error('Verification was not accepted');
    _adminManualLock=false;try{localStorage.removeItem('dcbc-admin-locked');}catch(e){}
    document.getElementById('pin-inp').value='';""")
# 22. The Attendance tab confirms only after the mark is saved (the toast used to appear first, so a mark could be
#     reported before it was stored; a refused save now shows no false confirmation).
sub("""  if(status==='absent'&&court){
    if(S.current){
      S.current.assignments[court]=(S.current.assignments[court]||[]).filter(pid=>pid!==id);
      if(!S.current.absentFrom)S.current.absentFrom={};S.current.absentFrom[id]=court; // remembered for the demotion at session end
      await setKV('current_session',S.current);
    }
    toast(S.players.find(p=>p.id===id)?.name.split(' ')[0]+' marked absent — off Court '+court+' tonight, one court down next week','warn');
  }else if(status==='present'){
    toast(S.players.find(p=>p.id===id)?.name.split(' ')[0]+' confirmed present','success');
  }
  // Save immediately (no debounce — attendance is critical)
  if(S.current)await setKV('current_session',S.current);
  else await setKV('pre_session_attendance',S.preAttendance||{});""", """  if(status==='absent'&&court&&S.current){
    S.current.assignments[court]=(S.current.assignments[court]||[]).filter(pid=>pid!==id);
    if(!S.current.absentFrom)S.current.absentFrom={};S.current.absentFrom[id]=court; // remembered for the demotion at session end
  }
  // Save immediately (no debounce — attendance is critical), then confirm
  if(S.current)await setKV('current_session',S.current);
  else await setKV('pre_session_attendance',S.preAttendance||{});
  const first=S.players.find(p=>p.id===id)?.name.split(' ')[0];
  if(status==='absent'&&court)toast(first+' marked absent — off Court '+court+' tonight, one court down next week','warn');
  else if(status==='present')toast(first+' confirmed present','success');""")
# 23. Every session step gets its own Undo. Start / next round / end / reset / cancel are only ever started by a tap, so if
#     another step is still finishing (e.g. the final round's automatic advance) they wait for it (up to 15 s) instead of
#     running unrecorded inside it — End Session could otherwise be undone only together with the round before it.
sub("""      if(name==='autoAdvanceCheck'&&_undoing)return; // never advance in the middle of an undo
      if(!adminUnlocked||_ckDepth>0||_undoing)return orig.apply(this,args);""", """      if(name==='autoAdvanceCheck'&&_undoing)return; // never advance in the middle of an undo
      if(SESSION_STEPS.has(name)&&_ckDepth>0){
        for(let t=0;_ckDepth>0&&t<150;t++)await new Promise(r=>setTimeout(r,100));
        if(_ckDepth>0)return toast('The previous step is still finishing — try again in a moment','warn');
      }
      if(!adminUnlocked||_ckDepth>0||_undoing)return orig.apply(this,args);""")
sub("""function installUndoCheckpoints(){""", """const SESSION_STEPS=new Set(['startSession','endSession','nextCycle','resetSession','cancelSession']);
function installUndoCheckpoints(){""")
f.write_text(s)
print("p25 applied")
