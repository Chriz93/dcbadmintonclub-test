# p82 (September 18, 2026): Home stops asking for scores that are already in.
#  From the organizer: "already entered court 2 scores, why its asking here on home page to enter court 2 scores?"
#  The card showed "Your court tonight … Enter Court N scores" whenever the player was on a court in the current
#  session — it never looked at whether that court's round was already scored, or whether the night was over. After a
#  finished session it still asked for scores that had been entered hours earlier.
#  Now the card tells the truth: while the round is open and the court still owes games it offers the button; once the
#  court's games are in it says so; and when the night is finished it says the session is complete and waiting to be
#  ended, with no button.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""  if(card)card.innerHTML=member?.approved&&court?`<div class="card"><div class="card-title">Your court tonight: ${court} · Round ${S.current.cycle}</div><div style="font-size:12px;margin-bottom:8px;">Earned ladder court: ${member.currentCourt||'Unassigned'}. Enter results for the players listed on tonight’s court.</div><button class="btn btn-primary" onclick="document.getElementById('sc-sel').value='${court}';nav('scores')">Enter Court ${court} scores</button></div>`:'';""",
    """  // p82: say what is true — the night may be finished, or this court's games may already be in.
  if(card){
    if(!(member?.approved&&court))card.innerHTML='';
    else{
      const done=S.current.completed,scored=!done&&isCourtDone(court);
      const title=done?`Session ${S.current.number} complete · Court ${court}`:`Your court tonight: ${court} · Round ${S.current.cycle}`;
      const line=done?`All ${MAX_ROUNDS_PER_SESSION} rounds are played. The organizer ends the session to save the standings and next week's courts.`
        :scored?`Court ${court}'s Round ${S.current.cycle} games are in. Waiting for the other courts.`
        :`Earned ladder court: ${member.currentCourt||'Unassigned'}. Enter results for the players listed on tonight’s court.`;
      const btn=done?'':`<button class="btn ${scored?'btn-ghost':'btn-primary'}" onclick="document.getElementById('sc-sel').value='${court}';nav('scores')">${scored?`Review Court ${court} scores`:`Enter Court ${court} scores`}</button>`;
      card.innerHTML=`<div class="card"><div class="card-title">${title}</div><div style="font-size:12px;margin-bottom:8px;">${line}</div>${btn}</div>`;
    }
  }""")

f.write_text(s)
print("p82 applied")
