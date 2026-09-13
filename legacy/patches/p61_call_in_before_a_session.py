# p61 (September 13, 2026): Call In works before a session, and the spare pool shows who is already coming.
#  - Found by the organizer on TEST: in Admin → Players, "Call In" did nothing for two players. The audit remediation
#    routed Call In through tonight's court engine, which needs a running session; before a session it only showed
#    "Start a session before changing tonight's lineup" at the bottom of the screen. The pool also listed confirmed
#    spares (already seated in the upcoming lineup) as unassigned, with a Call In button.
#  - Now, during a session, Call In seats the player through the court engine, as before. Before a session, a spare is
#    answered "coming" for the next session (they take an open seat, wait for their e-transfer to be verified, or wait
#    on standby, and the message says which), and a regular with no court joins the ladder on the bottom court in use
#    (they start there next session). A spare who is already coming shows their status instead of a button, and the
#    Attendance tab's Seat button is not offered to a spare who already has a seat in the upcoming lineup.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("async function callInSpare(id){return changePlayerAttendance(id,'present');}",
    """// p61: Call In works before a session too. During a session it seats the player through the court engine. Before a
// session a spare is answered "coming" for the next session, and a regular with no court joins the ladder on the bottom
// court in use, where they start next session.
async function callInSpare(id){
 if(S.current)return changePlayerAttendance(id,'present');
 const p=S.players.find(x=>x.id===id);if(!p)return;
 if(!adminUnlocked)return toast('Organizer verification required','warn');
 if(!p.approved||p.waitlisted)return toast('Approve this player before calling them in','warn');
 const n=upcomingSessionNumber();
 if(isSpareMember(p)){
  try{await rpc('set_rsvp',{p_session:n,p_player:id,p_response:'coming'});}catch(e){return toast('Not called in: '+e.message,'error');}
  await loadAll();renderAll();
  const claim=spareSeats().claims.find(x=>x.id===id),court=spareCourtUpcoming(id);
  return toast(court?`${p.name} is coming to Session ${n} and takes an open seat on Court ${court}`
   :claim&&claim.reserved?`${p.name} is coming to Session ${n}; the seat is confirmed once the e-transfer is verified`
   :`${p.name} is coming to Session ${n} and is on standby until a regular declines`,'success');
 }
 const used=S.players.filter(x=>x.id!==id&&isRegularMember(x)&&x.currentCourt>0).map(x=>x.currentCourt),court=used.length?Math.max(...used):1;
 try{await sbU('players',id,{current_court:court,highest_court:p.highestCourt?Math.min(p.highestCourt,court):court});}catch(e){return;}
 await loadAll();renderAll();
 const next=S.current?0:(()=>{const a=upcomingLineup().assign;for(let c=1;c<=NC;c++)if((a[c]||[]).includes(id))return c;return 0;})();
 toast(`${p.name} joins the ladder on Court ${court} (the bottom court)`+(next===court?' and starts there next session':next?`; next session they start on Court ${next}`:''),'success');
}
// p61: the court a spare starts on in the upcoming lineup (0 when they have no seat).
function spareCourtUpcoming(id){if(S.current)return 0;const a=upcomingLineup().assign;for(let c=1;c<=NC;c++)if((a[c]||[]).includes(id))return c;return 0;}
// p61: the pool's action for a player: a spare who is already coming for the next session shows their status instead.
function poolAction(p){
 if(!S.current&&isSpareMember(p)&&(S.rsvp||{})[p.id]==='coming'){
  const court=spareCourtUpcoming(p.id);
  return court?`<span class="tag tg-green" title="${esc(p.name)} is coming to the next session and has a seat">✓ Coming · Court ${court}</span>`
   :`<span class="tag tg-yellow" title="${esc(p.name)} is coming to the next session, on standby">Coming · standby</span>`;
 }
 return `<button class="btn btn-success btn-sm" style="padding:3px 6px;font-size:11px;margin:0;" aria-label="Call in ${esc(p.name)}" onclick="callInSpare(${p.id})">📲 Call In</button>`;
}""")
# Admin → Players and the Attendance tab's spare pool use the same action.
sub("""<button class="btn btn-success btn-sm" style="padding:3px 6px;font-size:11px;" onclick="callInSpare(${p.id})">📲 Call In</button>""", "${poolAction(p)}")
sub("""<button class="btn btn-success btn-sm" style="padding:3px 8px;font-size:10px;margin:0;" onclick="callInSpare(${p.id})">📲 Call In</button>""", "${poolAction(p)}")
# Attendance → confirmed spares: before a session "seated" means a seat in the upcoming lineup.
sub("const seated=S.current?Object.values(S.current.assignments).some(a=>(a||[]).includes(p.id)):p.currentCourt>0;",
    "const seated=S.current?Object.values(S.current.assignments).some(a=>(a||[]).includes(p.id)):spareCourtUpcoming(p.id)>0;")
f.write_text(s)
print("p61 applied")
