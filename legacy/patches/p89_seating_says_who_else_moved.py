# p89 (September 21, 2026): seating a player says what it did to the rest of the courts.
#  From the organizer, on the Courts tab with no session started: "when I add a player to court 4, another player who is
#  on court 5 automatically jumps to court4, his name is Akash who is on court 5 jumps to court 4".
#  What is happening: tonight's courts are not stored, they are worked out every time from the court each player earned
#  plus the seating rules, and one of those rules is that nobody plays alone. Akash earned Court 4 and was the only
#  player coming who had earned it, so the engine moved him up to Court 5 and said so in the notes. Seating a second
#  player on Court 4 removes the reason he was moved, so he goes back to the court he earned — Court 4 becomes a real
#  court with two players instead of an empty one plus a five-player Court 5.
#  So the courts were right. What was wrong is that NOTHING SAID SO: seating a regular gave no message at all, the note
#  explaining Akash's move simply disappeared, and two players changed court after one click.
#  Now the seat change reports itself, and names anyone else the rules moved with it, marking a player who has gone back
#  to the court they earned. The same message covers removing a player from a court, where the rules move people too.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""async function setPlayerCourt(id,c){
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
}""",
    """// p89: where everyone sits in tonight's line-up right now, by player id.
function upcomingSeats(){const a=(upcomingLineup()||{}).assign||{},m={};for(let c=1;c<=NC;c++)(a[c]||[]).forEach(pid=>{m[pid]=c;});return m;}
// p89: anyone other than the player just moved whose court changed as a result, said plainly. The seating rules move
// people — nobody plays alone, no court holds more than five — and before this the courts simply changed in silence.
function seatKnockOn(before,after,movedId){
  const out=[];
  Object.keys(after).map(Number).forEach(pid=>{
    if(pid===movedId||!before[pid]||before[pid]===after[pid])return;
    const q=S.players.find(x=>x.id===pid),home=q&&q.currentCourt===after[pid];
    out.push(`${q?q.name.split(' ')[0]:'#'+pid} C${before[pid]}→C${after[pid]}${home?' (earned)':''}`);
  });
  Object.keys(before).map(Number).forEach(pid=>{if(pid!==movedId&&after[pid]===undefined)out.push(`${(S.players.find(x=>x.id===pid)||{}).name?.split(' ')[0]||'#'+pid} off the courts`);});
  if(!out.length)return '';
  return ' · also moved: '+(out.length>3?out.slice(0,3).join(', ')+` and ${out.length-3} more`:out.join(', '));
}
async function setPlayerCourt(id,c){
 const court=Number(c);if(S.current)return moveCourtPlayer(id,court);
 if(!Number.isInteger(court)||court<0||court>NC)return toast('Choose a valid court','warn');
 const p=S.players.find(x=>x.id===id);if(!p)return;
 const seatsBefore=upcomingSeats(); // p89
 await sbU('players',id,{current_court:court,highest_court:court?Math.min(p.highestCourt||court,court):p.highestCourt});
 if(isSpareMember(p)){ // p71: the organizer seats a spare for the coming session (court 0 unseats them)
  const pre={...(S.preAttendance||{})};if(court)pre[id]='present';else delete pre[id];
  try{await setKV('pre_session_attendance',pre);S.preAttendance=pre;}catch(e){await loadAll();renderAll();return toast('Seat not saved: '+e.message,'error');}
  await loadAll();renderAll();
  return toast((court?`${p.name} (spare) is seated on Court ${court} for Session ${upcomingSessionNumber()}`:`${p.name} (spare) is no longer seated for Session ${upcomingSessionNumber()}`)+seatKnockOn(seatsBefore,upcomingSeats(),id),'success'); // p89
 }
 await loadAll();renderAll();
 // p89: a regular's seat change said nothing at all, so a player the rules moved with it changed court in silence.
 toast((court?`${p.name} is on Court ${court}`:`${p.name} has no court for Session ${upcomingSessionNumber()}`)+seatKnockOn(seatsBefore,upcomingSeats(),id),'success');
}""")

f.write_text(s)
print("p89 applied")
