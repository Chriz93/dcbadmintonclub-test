# p95 (September 22, 2026): the court panel stays open while the organizer arranges it, and says what it did.
#  From the organizer: "Courts Add player/remove is not working properly".
#  Two things were wrong with that panel, both of them on every single click:
#   * it closed. Adding four players to a court meant opening the court, opening "+ Add Player to Court", choosing a
#     player, saving — and then doing the whole thing again for the next player, four times over. Removing a player
#     closed it too, so checking the result meant reopening the court.
#   * removing a player reported "Answer updated for Liam Leblanc". That is the wording of an RSVP change, which is
#     what happens underneath, but the organizer had just taken somebody off a court and was told nothing about the
#     court, nor that the player keeps the court they earned.
#  Now the panel reopens on the court that was being arranged, showing the line-up as it now stands, and removing a
#  player says so in court terms. During a session nothing changes: the court engine's own preview dialog owns the
#  screen there, and reopening the panel over it would take it away.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# The Remove button says which court it is removing from, so the panel can come back to it.
sub("""          ${p&&adminUnlocked&&!S.current?`<button class="btn btn-ghost btn-sm" style="margin:6px 0 0;" aria-label="Remove ${esc(p.name)} from Court ${court}" onclick="removeFromUpcoming(${p.id})">Remove</button>`:''}""",
    """          ${p&&adminUnlocked&&!S.current?`<button class="btn btn-ghost btn-sm" style="margin:6px 0 0;" aria-label="Remove ${esc(p.name)} from Court ${court}" onclick="removeFromUpcoming(${p.id},${court})">Remove</button>`:''}""")

sub("""async function quickAddToCourt(court){const id=parseInt(document.getElementById('modal-player-sel')?.value);if(!id)return toast('Select a player','warn');if(!S.current){closeModal();return setPlayerCourt(id,court);}await moveCourtPlayer(id,court);} // p71""",
    """// p95: before a session the panel comes back on the court being arranged, so several players can be added in a row.
// During a session the move goes through the court engine, which puts its own preview on screen; leave that alone.
async function quickAddToCourt(court){
  const id=parseInt(document.getElementById('modal-player-sel')?.value);if(!id)return toast('Select a player','warn');
  if(!S.current){closeModal();await setPlayerCourt(id,court);return showCourtDetail(court);}
  await moveCourtPlayer(id,court);
}""")

sub("""async function removeFromUpcoming(id){
 if(S.current)return toast('Players are set before the session starts — change tonight’s courts in Attendance.','warn');
 if(!adminUnlocked)return toast('Organizer verification required','warn');
 const p=S.players.find(x=>x.id===id);if(!p)return;
 if(isSpareMember(p)){closeModal();return setPlayerCourt(id,0);}
 if(!confirm(`${p.name} is not coming to Session ${upcomingSessionNumber()}? No penalty; they keep Court ${p.currentCourt}.`))return;
 closeModal();
 if((S.preAttendance||{})[id]==='present'){const pre={...S.preAttendance};delete pre[id]; // a "present" mark would keep them on
  try{await setKV('pre_session_attendance',pre);S.preAttendance=pre;}catch(e){return toast('Not removed: '+e.message,'error');}}
 return adminSetVote(id,'notcoming');
}""",
    """async function removeFromUpcoming(id,fromCourt){ // p95: fromCourt brings the panel back to the court being arranged
 if(S.current)return toast('Players are set before the session starts — change tonight’s courts in Attendance.','warn');
 if(!adminUnlocked)return toast('Organizer verification required','warn');
 const p=S.players.find(x=>x.id===id);if(!p)return;
 if(isSpareMember(p)){closeModal();await setPlayerCourt(id,0);if(fromCourt)showCourtDetail(fromCourt);return;}
 if(!confirm(`${p.name} is not coming to Session ${upcomingSessionNumber()}? No penalty; they keep Court ${p.currentCourt}.`))return;
 closeModal();
 if((S.preAttendance||{})[id]==='present'){const pre={...S.preAttendance};delete pre[id]; // a "present" mark would keep them on
  try{await setKV('pre_session_attendance',pre);S.preAttendance=pre;}catch(e){return toast('Not removed: '+e.message,'error');}}
 const kept=p.currentCourt;
 await adminSetVote(id,'notcoming');
 // p95: "Answer updated for X" is the RSVP wording. Say what the organizer actually did, and what it did not cost.
 toast(`${p.name} is off Court ${fromCourt||kept} for Session ${upcomingSessionNumber()} — they keep Court ${kept}`,'success');
 if(fromCourt)showCourtDetail(fromCourt);
}""")

f.write_text(s)
print("p95 applied")
