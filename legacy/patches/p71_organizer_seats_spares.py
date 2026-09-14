# p71 (September 14, 2026): before a session the organizer seats, moves and removes players on the Courts page.
#  From the organizer (production, September 14): "if I assign the court for the spare player under admin, it should be
#  reflected under main courts, I should have that flexibility, edit, remove, assign courts". A spare's court was
#  ignored before a session (spares played only through the p69 spare seats: available, decided at the deadline, paid).
#  Now, before a session:
#  - Assigning a spare a court (Admin, or + Add on the Courts page) seats them on that court for the coming session,
#    whatever their answer or payment; the mark is the pre-session attendance "present", which Start Session clears, so
#    it holds for that session only. Court 0 unseats them.
#  - + Add on the Courts page offers every approved player (regulars move to that court, as in Admin → Players).
#  - The court's details offer Remove: a spare is unseated; a regular is marked "not coming" for the session (no
#    penalty, they keep their court), the answer the organizer can already change in Standings → RSVP.
#  During a session nothing changes: players are set before the session starts (p68).
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

# The starting courts: spares the organizer seated go on their court first.
sub("""function autoAssign(exclude=new Set(),spares=[]){
  const L={};for(let c=1;c<=NC;c++)L[c]=[];
  const nm=id=>S.players.find(p=>p.id===id)?.name||'Player',notes=[];
  activePlayers().filter(p=>p.approved&&!p.waitlisted&&p.membershipType!=='spare'&&!exclude.has(p.id)).forEach(p=>L[Math.min(NC,Math.max(1,p.currentCourt))].push(p.id));
""", """function autoAssign(exclude=new Set(),spares=[],seated=[]){
  const L={};for(let c=1;c<=NC;c++)L[c]=[];
  const nm=id=>S.players.find(p=>p.id===id)?.name||'Player',notes=[];
  activePlayers().filter(p=>p.approved&&!p.waitlisted&&p.membershipType!=='spare'&&!exclude.has(p.id)).forEach(p=>L[Math.min(NC,Math.max(1,p.currentCourt))].push(p.id));
  for(const p of seated){if(exclude.has(p.id)||Object.values(L).some(ids=>ids.includes(p.id)))continue;const c=Math.min(NC,Math.max(1,p.currentCourt));L[c].push(p.id);notes.push(`${nm(p.id)} (spare) is seated by the organizer on Court ${c}.`);} // p71
""")
sub("""  const confirmedSpares=spareSeats().claims.filter(c=>c.confirmed).map(c=>c.id).filter(id=>!preAbsent.has(id));
  const assign=autoAssign(new Set([...declined,...preAbsent]),confirmedSpares),""",
    """  const confirmedSpares=spareSeats().claims.filter(c=>c.confirmed).map(c=>c.id).filter(id=>!preAbsent.has(id));
  const seatedSpares=organizerSeated(pre); // p71
  const assign=autoAssign(new Set([...declined,...preAbsent]),confirmedSpares,seatedSpares),""")
sub("""function upcomingLineup(){""", """// p71: spares the organizer seated for the coming session: marked present before the night, on the court assigned.
function organizerSeated(pre){return S.current?[]:S.players.filter(p=>isSpareMember(p)&&!p.waitlisted&&p.currentCourt>0&&(pre||{})[p.id]==='present');}
function upcomingLineup(){""")

# Assigning a court before a session: a spare is seated (or unseated with court 0) for the coming session.
sub("""async function setPlayerCourt(id,c){
 const court=Number(c);if(S.current)return moveCourtPlayer(id,court);
 if(!Number.isInteger(court)||court<0||court>NC)return toast('Choose a valid court','warn');
 const p=S.players.find(x=>x.id===id);if(!p)return;
 await sbU('players',id,{current_court:court,highest_court:court?Math.min(p.highestCourt||court,court):p.highestCourt});await loadAll();renderAll();
}""", """async function setPlayerCourt(id,c){
 const court=Number(c);if(S.current)return moveCourtPlayer(id,court);
 if(!Number.isInteger(court)||court<0||court>NC)return toast('Choose a valid court','warn');
 const p=S.players.find(x=>x.id===id);if(!p)return;
 await sbU('players',id,{current_court:court,highest_court:court?Math.min(p.highestCourt||court,court):p.highestCourt});
 if(isSpareMember(p)){ // p71: the organizer seats a spare for the coming session (court 0 unseats them)
  const pre={...(S.preAttendance||{})};if(court)pre[id]='present';else delete pre[id];
  try{await setKV('pre_session_attendance',pre);S.preAttendance=pre;}catch(e){await loadAll();renderAll();return toast('Seat not saved: '+e.message,'error');}
  await loadAll();renderAll();
  return toast(court?`${p.name} (spare) is seated on Court ${court} for Session ${upcomingSessionNumber()}`:`${p.name} (spare) is no longer seated for Session ${upcomingSessionNumber()}`,'success');
 }
 await loadAll();renderAll();
}
// p71: Remove on the Courts page before a session: a spare is unseated; a regular is marked "not coming" (no penalty).
async function removeFromUpcoming(id){
 if(S.current)return toast('Players are set before the session starts — change tonight’s courts in Attendance.','warn');
 if(!adminUnlocked)return toast('Organizer verification required','warn');
 const p=S.players.find(x=>x.id===id);if(!p)return;
 if(isSpareMember(p)){closeModal();return setPlayerCourt(id,0);}
 if(!confirm(`${p.name} is not coming to Session ${upcomingSessionNumber()}? No penalty; they keep Court ${p.currentCourt}.`))return;
 closeModal();
 if((S.preAttendance||{})[id]==='present'){const pre={...S.preAttendance};delete pre[id]; // a "present" mark would keep them on
  try{await setKV('pre_session_attendance',pre);S.preAttendance=pre;}catch(e){return toast('Not removed: '+e.message,'error');}}
 return adminSetVote(id,'notcoming');
}""")

# + Add on the Courts page before a session: every approved player; regulars move there, spares are seated there.
sub("""function showCourtAddPlayer(court){
  openModal('Add Player to Court '+court,`
    <label class="lbl">Select Player</label>
    <select class="inp" id="modal-player-sel">
      <option value="">— Choose —</option>
      ${activePlayers().map(p=>`<option value="${p.id}">${esc(p.name)} (C${p.currentCourt})</option>`).join('')}
    </select>""", """function showCourtAddPlayer(court){
  const here=S.current?[]:(upcomingLineup().assign[court]||[]); // p71: before a session, every approved player not already here
  const pick=S.current?activePlayers():S.players.filter(p=>p.approved&&!p.waitlisted&&!here.includes(p.id));
  openModal('Add Player to Court '+court,`
    <label class="lbl">Select Player</label>
    <select class="inp" id="modal-player-sel">
      <option value="">— Choose —</option>
      ${pick.map(p=>`<option value="${p.id}">${esc(p.name)} (${!S.current&&isSpareMember(p)?'spare':'C'+p.currentCourt})</option>`).join('')}
    </select>""")
sub("""async function quickAddToCourt(court){const id=parseInt(document.getElementById('modal-player-sel')?.value);if(!id)return toast('Select a player','warn');await moveCourtPlayer(id,court);}""",
    """async function quickAddToCourt(court){const id=parseInt(document.getElementById('modal-player-sel')?.value);if(!id)return toast('Select a player','warn');if(!S.current){closeModal();return setPlayerCourt(id,court);}await moveCourtPlayer(id,court);} // p71""")

# The court's details: Remove for each player, before a session.
sub("""          ${p?`<div style="font-size:10px;color:var(--muted);margin-top:2px;">${p.seasonWins}W · ${p.seasonLosses}L</div>`:''}
        </div>`;}).join('')}""", """          ${p?`<div style="font-size:10px;color:var(--muted);margin-top:2px;">${p.seasonWins}W · ${p.seasonLosses}L</div>`:''}
          ${p&&adminUnlocked&&!S.current?`<button class="btn btn-ghost btn-sm" style="margin:6px 0 0;" aria-label="Remove ${esc(p.name)} from Court ${court}" onclick="removeFromUpcoming(${p.id})">Remove</button>`:''}
        </div>`;}).join('')}""")

f.write_text(s)
print("p71 applied")
