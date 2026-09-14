# p69 (September 14, 2026): spares fill the courts up to 24 players, decided when the regulars' vote closes.
#  From the organizer (TEST, September 14): "we have 27 regular players, if say 4 of them voted no, we will take in one
#  spare, so that the courts are all 4 players"; "spares joins only if we dont have minimum 24 players"; "spares wont
#  get priority for voting" — spare seats are worked out only after the regulars' deadline, then spares who said they
#  are available fill them in the order they replied, confirmed once paid. The organizer invites spares personally.
#  Before: one spare seat for every regular who declined (27 regulars, 4 declines → 4 spares, 27 players), reserved
#  from the moment a spare answered.
#  - Spare seats = 24 minus the regulars coming, counted as the starting courts seat them: regulars with a ladder
#    court who have not voted "not coming" (no answer counts as coming), without those marked absent before the night
#    and with those marked present despite a "not coming" vote. No seat is reserved before the regulars' vote closes (46 hours before play); then available
#    spares take the seats in the order they replied, and a seat is confirmed when payment is verified.
#  - Home, Standings → RSVP, Attendance's "Spares for Session", the rules and Call In's answers say so. A spare is only
#    charged for a session once they hold a seat (unchanged: charges follow the reserved seat).
#  Not changed here: the database's spare_seats and reminder functions (migration L07) and the reminder emails still
#  count one seat per declined regular; they must follow before a production release (docs/32).
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

# The seats.
sub("""function spareSeats(){
 const rows=S.rsvpRows||[],byId=id=>S.players.find(p=>p.id===id);
 const declined=rows.filter(r=>r.response==='notcoming'&&isRegularMember(byId(r.player_id))).length;
 const n=upcomingSessionNumber();""",
    """// p69: spares play only when fewer than 24 regulars are coming. The seats (24 minus the regulars coming, counted as the
// starting courts seat them) are decided when the regulars' vote closes; available spares then take them in the order
// they replied, and a seat is confirmed once paid. Before the deadline no seat is reserved.
function spareSeats(){
 const SPARE_TARGET=24;
 const rows=S.rsvpRows||[],byId=id=>S.players.find(p=>p.id===id),vote={};rows.forEach(r=>{vote[r.player_id]=r.response;});
 const pre=S.current?{}:(S.preAttendance||{}),regulars=S.players.filter(p=>isRegularMember(p)&&p.currentCourt>0);
 const declined=regulars.filter(p=>vote[p.id]==='notcoming').length,coming=regulars.filter(p=>pre[p.id]!=='absent'&&(vote[p.id]!=='notcoming'||pre[p.id]==='present')).length;
 const seats=Math.max(0,SPARE_TARGET-coming),n=upcomingSessionNumber(),startAt=FD[n-1];
 const deadline=startAt?new Date(startAt.getTime()-FEES.voteDeadlineHours*3600000):null,decided=!!S.current||!deadline||Date.now()>deadline.getTime();""")
sub(""".map((r,i)=>{const paid=(S_me.organizer||r.player_id===S_me.player_id)?paidForSession(r.player_id,n)>=FEES.spareSession:!!byId(r.player_id)?.paid;return{id:r.player_id,rank:i+1,reserved:i<declined,paid,confirmed:i<declined&&paid};});
 return{declined,claims,open:Math.max(declined-claims.length,0)};""",
    """.map((r,i)=>{const paid=(S_me.organizer||r.player_id===S_me.player_id)?paidForSession(r.player_id,n)>=FEES.spareSession:!!byId(r.player_id)?.paid,reserved=decided&&i<seats;return{id:r.player_id,rank:i+1,reserved,paid,confirmed:reserved&&paid};});
 return{declined,coming,seats,decided,deadline,claims,open:Math.max(seats-claims.length,0)};""")

# Standings → RSVP and Home: the spare-seats line.
sub("""Spare seats: <strong style="color:var(--text);">${seats.open} open</strong> · ${seats.claims.filter(c=>c.confirmed).length} confirmed · ${seats.claims.filter(c=>!c.reserved).length} standby</div>`;""",
    """${seats.decided?`Spare seats: <strong style="color:var(--text);">${seats.open} open</strong> · ${seats.claims.filter(c=>c.confirmed).length} confirmed · ${seats.claims.filter(c=>!c.reserved).length} standby`:`Spare seats: <strong style="color:var(--text);">${seats.seats}</strong> if the vote closed now (${seats.coming} regulars coming) · decided ${fmt(seats.deadline)}`}</div>`;""")
# Home, a spare's card: when and how seats are decided.
sub("""${now<spareAsk.getTime()?`Spares are asked from ${fmt(spareAsk)} (${FEES.spareAskHours} hours before play) whenever a regular declines. You can already say if you are available.`:`Seats open as regulars decline; answer early — seats go in the order spares reply.`}""",
    """${now<=deadline.getTime()?`Spare seats are decided when the regulars' vote closes (${fmt(deadline)}): with fewer than 24 regulars coming, available spares fill the seats in the order they replied, confirmed once paid. You can already say if you are available.`:seats.seats?`${seats.seats} spare seat${seats.seats===1?'':'s'} this session, taken in the order spares replied and confirmed once paid.`:`24 or more regulars are coming — no spare seats this session.`}""")
# The rules.
sub("""put('rules-spares',`Spares are asked from ${FEES.spareAskHours} hours before play whenever a regular declines; seats are reserved in answer order and confirmed when payment is verified.`);""",
    """put('rules-spares',`Spares play only when fewer than 24 regulars are coming. The spare seats (24 minus the regulars coming) are decided when the regulars' vote closes, ${FEES.voteDeadlineHours} hours before play; available spares take them in the order they replied, and a seat is confirmed when payment is verified. The organizer invites spares personally.`);""")
# Call In before a session: a spare's answer.
sub("""  const claim=spareSeats().claims.find(x=>x.id===id),court=spareCourtUpcoming(id);
  return toast(court?`${p.name} is coming to Session ${n} and takes an open seat on Court ${court}`
   :claim&&claim.reserved?`${p.name} is coming to Session ${n}; the seat is confirmed once the e-transfer is verified`
   :`${p.name} is coming to Session ${n} and is on standby until a regular declines`,'success');""",
    """  const seats=spareSeats(),claim=seats.claims.find(x=>x.id===id),court=spareCourtUpcoming(id);
  return toast(court?`${p.name} is coming to Session ${n} and takes an open seat on Court ${court}`
   :claim&&claim.reserved?`${p.name} is coming to Session ${n}; the seat is confirmed once the e-transfer is verified`
   :!seats.decided?`${p.name} is coming to Session ${n}; spare seats are decided when the regulars' vote closes`
   :`${p.name} is coming to Session ${n} and is on standby: ${seats.seats?'every spare seat is taken':'24 or more regulars are coming'}`,'success');""")
# Home, a spare's status: before the deadline seats are not decided; after it, the place in line counts from the seats.
# The organizer invites spares personally, so the status no longer promises a reminder email when a seat opens.
sub("""        : `<div class="alert alert-warn spare-status" style="text-align:center;margin-top:10px;">⏳ Standby — you are #${myClaim.rank-seats.declined} in line. A reservation update will be sent on the next scheduled reminder run when a seat opens (if email reminders are on).</div>`;""",
    """        : !seats.decided?`<div class="alert alert-info spare-status" style="text-align:center;margin-top:10px;">⏳ Available — spare seats are decided when the regulars' vote closes (${fmt(seats.deadline)}). You are #${myClaim.rank} among the spares who replied.</div>`
        : `<div class="alert alert-warn spare-status" style="text-align:center;margin-top:10px;">⏳ Standby — you are #${myClaim.rank-seats.seats} in line: ${seats.seats?'every spare seat is taken':'24 or more regulars are coming'}. The organizer contacts you if a seat opens.</div>`;""")
# Standings → RSVP: a spare who replied before the deadline is available, not yet on standby.
sub("""c?.reserved?'<span class="tag tg-yellow">Seat reserved — payment pending</span>':'<span class="tag tg-yellow">⏳ Standby</span>'""",
    """c?.reserved?'<span class="tag tg-yellow">Seat reserved — payment pending</span>':seats.decided?'<span class="tag tg-yellow">⏳ Standby</span>':'<span class="tag tg-yellow">⏳ Available</span>'""")
# Attendance: "Spares for Session N".
sub("""  // Spares confirmed by the vote (declined regulars open the seats)""",
    """  // Spares for the session: seats for fewer than 24 regulars coming, decided when the regulars' vote closes (p69)""")
sub("""${seatsTonight.declined} regular${seatsTonight.declined===1?'':'s'} declined · ${seatsTonight.claims.filter(c=>c.confirmed).length} confirmed · ${seatsTonight.claims.filter(c=>!c.reserved).length} standby. Confirmed spares are seated automatically when the night starts.""",
    """${seatsTonight.coming} regular${seatsTonight.coming===1?'':'s'} coming · ${seatsTonight.seats} spare seat${seatsTonight.seats===1?'':'s'}${seatsTonight.decided?'':' if the vote closed now'} · ${seatsTonight.claims.filter(c=>c.confirmed).length} confirmed · ${seatsTonight.claims.filter(c=>!c.reserved).length} standby. Confirmed spares are seated automatically when the night starts.""")

f.write_text(s)
print("p69 applied")
