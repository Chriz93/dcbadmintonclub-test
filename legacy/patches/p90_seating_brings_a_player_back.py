# p90 (September 22, 2026): seating a regular puts them back in tonight's line-up, and the message tells the truth.
#  From the organizer: "I TRIED adding Rahul Tamarkar to court 4, it didnt work. rahul was on court 3, but when a high
#  level spare comes, I bring a down a player of lower caliber so thats why Rahul lost his spot on court 3, but then
#  when I try to add him to court 4, its not wokring."
#  Why: taking a regular off a court before a session marks them NOT COMING (removeFromUpcoming — no penalty, they keep
#  the court they earned). Tonight's line-up leaves out everyone who is not coming, and it does that BEFORE it reads
#  anybody's court. So seating Rahul wrote his court to 4 and changed nothing on screen: he was still excluded, Court 4
#  stayed empty, and he appeared on no court at all.
#  Worse, p89's new message then claimed "Rahul tamrakar is on Court 4" while the grid showed him nowhere — a message
#  that reported the request instead of the result.
#  Now: putting a regular on a court is taken to mean they are playing, so it clears a "not coming" vote or an absent
#  mark the same way the organizer's Present mark does (pre_session_attendance), and the message reports where the
#  player actually ended up — including the case where the rules put them somewhere other than the court asked for.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub(""" await loadAll();renderAll();
 // p89: a regular's seat change said nothing at all, so a player the rules moved with it changed court in silence.
 toast((court?`${p.name} is on Court ${court}`:`${p.name} has no court for Session ${upcomingSessionNumber()}`)+seatKnockOn(seatsBefore,upcomingSeats(),id),'success');
}""",
    """ // p90: a regular taken off a court is marked "not coming", and the line-up leaves out everyone who is not coming
 // before it reads anyone's court. Putting them on a court means they are playing, so lift that the way the
 // organizer's own Present mark does — otherwise the seat is written and nothing appears.
 if(court){
  const pre={...(S.preAttendance||{})};
  if((S.rsvp||{})[id]==='notcoming'||pre[id]==='absent'){
   pre[id]='present';
   try{await setKV('pre_session_attendance',pre);S.preAttendance=pre;}
   catch(e){await loadAll();renderAll();return toast('Seat not saved: '+e.message,'error');}
  }
 }
 await loadAll();renderAll();
 // p89, corrected by p90: say where the player ended up, not where they were asked to go.
 const seatsAfter=upcomingSeats(),landed=seatsAfter[id];
 const where=!court?`${p.name} has no court for Session ${upcomingSessionNumber()}`
  :landed===undefined?`${p.name} is not in tonight's line-up — mark them coming in Standings → RSVP, then seat them`
  :landed===court?`${p.name} is on Court ${court}`
  :`${p.name} is on Court ${landed}, not Court ${court} — the courts are settled so nobody plays alone`;
 toast(where+seatKnockOn(seatsBefore,seatsAfter,id),landed===undefined&&court?'warn':'success');
}""")

f.write_text(s)
print("p90 applied")
