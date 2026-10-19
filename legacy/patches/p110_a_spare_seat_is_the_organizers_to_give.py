# p110 (October 19, 2026): a spare does not vote for a seat. The organizer gives it.
#  THE ORGANIZER: "Spares should not be able to vote, Spares are only voted by admin manually."
#  WHAT IT WAS. A spare claimed a seat by answering "I'm available", and spareSeats() then ranked those answers by the
#  time they arrived: first spare to reply took the open seat, confirmed once paid. The organizer's own judgement --
#  who is the right standard for the court that is short, who has not played in a while, who actually pays -- had no
#  say in it. The race decided.
#  WHAT IT IS NOW. The seat is the organizer's to give, through Call In, exactly as it already worked for the spares
#  they seated by hand (p61, p71). What changes is only who may create the answer: the organizer, not the spare.
#  WHY NOTHING DOWNSTREAM MOVES. callInSpare() already writes the same rsvps row ('coming') that a spare's own answer
#  used to write. So the claim list, the reservation, the payment check, the seat-confirmed email and the line-up all
#  keep working untouched -- they never cared who wrote the row, only that it was there.
#  THE SESSION ALREADY UNDER WAY IS NOT TOUCHED. Nothing is deleted: a spare who already answered for the upcoming
#  session keeps that answer and the seat it earned them. Session 6's voting closed on 18 October in any case, so this
#  lands with nothing in flight.
#  THE UI IS NOT THE RULE. L32 is what enforces this -- set_rsvp is callable directly, so a spare with the developer
#  console could still answer for themselves if the buttons were merely hidden. This patch is the half that explains.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# THE PUBLISHED RULES FIRST. This paragraph is what every registrant reads and agrees to, and it described the race
# exactly: "spares who said 'available' reserve seats in answer order". Leaving it would be the same fault p108 was
# written to fix, in the other direction -- the page promising one thing and the engine doing another.
sub("""      • Spares: when a regular votes “not coming”, a seat opens and spares who said “available” reserve seats in answer order; payment verification confirms them; the rest stay on standby.<br>""",
    """      • Spares: when a regular votes “not coming”, a seat opens and the organizer calls in a spare to fill it; payment verification confirms the seat. Spares do not vote — the organizer decides who plays.<br>""")

# The comments that described the race, so the next reader is not told the old rule by the code itself.
sub("""function voteLocked(p){ // regulars only; spares keep claiming seats until the night""",
    """function voteLocked(p){ // regulars only; a spare answers nothing at all (p110), so the deadline cannot bind them""")

sub("""// Seats: each declined regular opens one seat; spares who answered "available" take seats in answer order.""",
    """// Seats: each declined regular opens one seat; the organizer calls in a spare to fill it (p110).""")

sub("""// p69: spares play only when fewer than 24 regulars are coming. The seats (24 minus the regulars coming, counted as the
// starting courts seat them) are decided when the regulars' vote closes; available spares then take them in the order
// they replied, and a seat is confirmed once paid. Before the deadline no seat is reserved.""",
    """// p69: spares play only when fewer than 24 regulars are coming. The seats (24 minus the regulars coming, counted as the
// starting courts seat them) are decided when the regulars' vote closes; a seat is confirmed once paid, and before the
// deadline none is reserved. p110: the organizer fills those seats with Call In, which writes the same 'coming' row a
// spare used to write for themselves -- so the ranking below is now the order she called them in, not a race.""")

# The card is no longer a question put to the spare.
sub("""  html += `<div class="card"><div class="card-title">🗳️ ${meSpare?'Spare':'Vote'}: are you ${meSpare?'available for':'playing'} Session ${sessNo} (${DATES[sessNo-1]||''})?</div>""",
    """  html += `<div class="card"><div class="card-title">${meSpare?`🎫 Spare seat: Session ${sessNo} (${DATES[sessNo-1]||''})`:`🗳️ Vote: are you playing Session ${sessNo} (${DATES[sessNo-1]||''})?`}</div>""")

# The split table counted spares who had made themselves "available". That column is now the organizer's decisions.
sub("""      <tr data-g="spare"><td>Spares (available)</td>""",
    """      <tr data-g="spare"><td>Spares (called in)</td>""")

# p110: the timing line promised a race ("in the order they replied") and invited an answer ("You can already say if
# you are available"). Both are gone: it now says who decides, and when.
sub("""      html += `<div class="vote-timing" style="font-size:11px;color:var(--muted);margin-bottom:8px;">${now<=deadline.getTime()?`Spare seats are decided when the regulars' vote closes (${fmt(deadline)}): with fewer than 24 regulars coming, available spares fill the seats in the order they replied, confirmed once paid. You can already say if you are available.`:seats.seats?`${seats.seats} spare seat${seats.seats===1?'':'s'} this session, taken in the order spares replied and confirmed once paid.`:`24 or more regulars are coming — no spare seats this session.`}</div>`;""",
    """      html += `<div class="vote-timing" style="font-size:11px;color:var(--muted);margin-bottom:8px;">${now<=deadline.getTime()?`Spare seats are decided when the regulars' vote closes (${fmt(deadline)}): if fewer than 24 regulars are coming, the organizer calls in the spares they need.`:seats.seats?`${seats.seats} spare seat${seats.seats===1?'':'s'} open this session. The organizer calls in who they need; the seat is confirmed once paid.`:`24 or more regulars are coming — no spare seats this session.`}</div>`;""")

# p110: no buttons for a spare. The two-button grid is the regulars' vote and stays exactly as it was for them.
sub("""    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button class="btn ${myRsvp==='coming'?'btn-success':'btn-ghost'}" onclick="submitRSVP(true)" style="margin:0;" ${locked?'disabled':''}>✅ ${meSpare?"I'm available":"I'm Coming"}</button>
      <button class="btn ${myRsvp==='notcoming'?'btn-danger':'btn-ghost'}" onclick="submitRSVP(false)" style="margin:0;" ${locked?'disabled':''}>❌ ${meSpare?'Not available':'Not Coming'}</button>
    </div>`;""",
    """    html += meSpare?`<div class="alert alert-info spare-no-vote">Spare seats are given out by the organizer — there is nothing to answer here. If a seat opens and you are called in, it shows on this card and you will be emailed.</div>`
    :`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button class="btn ${myRsvp==='coming'?'btn-success':'btn-ghost'}" onclick="submitRSVP(true)" style="margin:0;" ${locked?'disabled':''}>✅ I'm Coming</button>
      <button class="btn ${myRsvp==='notcoming'?'btn-danger':'btn-ghost'}" onclick="submitRSVP(false)" style="margin:0;" ${locked?'disabled':''}>❌ Not Coming</button>
    </div>`;""")

# p110: the locked notice is the regulars' deadline. A spare was never voting, so it does not apply to them.
sub("""    if(locked)html += `<div class="alert alert-warn vote-locked" style="margin-top:10px;">🔒 Voting is closed for this session""",
    """    if(locked&&!meSpare)html += `<div class="alert alert-warn vote-locked" style="margin-top:10px;">🔒 Voting is closed for this session""")

# p110: a spare's status is now the record of a decision the organizer made, not of a place in a queue they joined.
sub("""        ? `<div class="alert alert-success spare-status" style="text-align:center;margin-top:10px;">🎉 Seat confirmed and paid (seat ${myClaim.rank}).</div>`
        : !seats.decided?`<div class="alert alert-info spare-status" style="text-align:center;margin-top:10px;">⏳ Available — spare seats are decided when the regulars' vote closes (${fmt(seats.deadline)}). You are #${myClaim.rank} among the spares who replied.</div>`
        : `<div class="alert alert-warn spare-status" style="text-align:center;margin-top:10px;">⏳ Standby — you are #${myClaim.rank-seats.seats} in line: ${seats.seats?'every spare seat is taken':'24 or more regulars are coming'}. The organizer contacts you if a seat opens.</div>`;""",
    """        ? `<div class="alert alert-success spare-status" style="text-align:center;margin-top:10px;">🎉 Seat confirmed and paid (seat ${myClaim.rank}).</div>`
        : !seats.decided?`<div class="alert alert-info spare-status" style="text-align:center;margin-top:10px;">⏳ The organizer has called you in. Seats are settled when the regulars' vote closes (${fmt(seats.deadline)}).</div>`
        : `<div class="alert alert-warn spare-status" style="text-align:center;margin-top:10px;">⏳ Standby — ${seats.seats?'every spare seat is taken':'24 or more regulars are coming'}. The organizer contacts you if a seat opens.</div>`;""")

# p110: and the answer itself is refused in the browser too, so a stale page cannot post one the database will reject.
sub("""  const me=myPlayer();
  if(!me) return toast('Not registered', 'warn');
  if(voteLocked(me)) return toast('Voting is closed for this session. Message the admin in the group to change your answer.', 'warn');""",
    """  const me=myPlayer();
  if(!me) return toast('Not registered', 'warn');
  // p110: a spare does not answer for themselves. L32 refuses it at the database too; this is only the kinder message.
  if(isSpareMember(me)) return toast('Spare seats are given out by the organizer — there is nothing to answer here.', 'info');
  if(voteLocked(me)) return toast('Voting is closed for this session. Message the admin in the group to change your answer.', 'warn');""")

f.write_text(s)
print("p110 applied")
