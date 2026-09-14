# p68 (September 14, 2026): players are set before the session starts; the organizer's own vote locks too.
#  From the organizer (TEST, September 14): "Spares cannot be called in middle of a session, all player numbers will be
#  finalized before a session begin" (Call In removed for everyone once a session has started), and "I am still able
#  to vote no, not coming is working, not locked … its past Sun 10.00 pm".
#  - During a session the Spare Pool offers no Call In: a player seated tonight shows "✓ Playing · Court N" (p66), anyone
#    else "Not playing tonight". A Call In that reaches the page during a session is refused and changes nothing.
#    Late arrivals and absences of players in tonight's lineup are still handled in Attendance.
#  - The same holds for the two other ways a player not in tonight's lineup was seated during a session: Attendance's
#    "Seat anyway" for a regular who voted out (it called Call In) is gone, and the Players tag of a player without a
#    court tonight answers that players are set before the session starts instead of seating them.
#    Attendance's "Spares for Session" card showed "🪑 Seat" (Call In) for a spare without a seat during a session as
#    well; during a session it now shows where the spare plays tonight, or that they are not playing tonight.
#  - The vote lock (46 hours before play) skipped the organizer's own answer on Home while they were unlocked. It now
#    applies to them as to every regular; the organizer changes any answer, their own included, in Standings → RSVP.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub(""" // p66: during a session a player Call In has already seated tonight shows their court instead of Call In.
 if(S.current){const tc=courtOfPlayer(p.id);if(tc)return `<span class="tag tg-green" title="${esc(p.name)} is playing tonight on Court ${tc}">✓ Playing · Court ${tc}</span>`;}""",
    """ // p66: during a session a player Call In has already seated tonight shows their court instead of Call In.
 // p68: players are set before the session starts: during a session nobody is called in; the pool says who plays.
 if(S.current){const tc=courtOfPlayer(p.id);return tc?`<span class="tag tg-green" title="${esc(p.name)} is playing tonight on Court ${tc}">✓ Playing · Court ${tc}</span>`:`<span class="tag" title="${esc(p.name)} is not playing tonight: players are set before the session starts">Not playing tonight</span>`;}""")
sub("async function callInSpare(id){\n if(S.current)return changePlayerAttendance(id,'present');",
    "async function callInSpare(id){\n if(S.current)return toast('Players are set before the session starts — Call In is only used before the session.','warn'); // p68")
sub("""<div style="font-size:11px;color:var(--muted);margin-bottom:8px;">Tap "Call In" to add a spare to an open court slot.</div>""",
    """<div style="font-size:11px;color:var(--muted);margin-bottom:8px;">${S.current?'Players are set before the session starts.':'Tap "Call In" to add a spare to an open court slot.'}</div>""")
sub("function voteLocked(p){ // regulars only; spares keep claiming seats until the night\n  if(!p||isSpareMember(p)||adminUnlocked)return false;",
    "function voteLocked(p){ // regulars only; spares keep claiming seats until the night\n"
    "  // p68: the organizer's own answer locks too; the organizer changes any answer (their own included) in Standings → RSVP.\n"
    "  if(!p||isSpareMember(p))return false;")

sub("""${S.current?`<button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:10px;margin:0;" onclick="callInSpare(${p.id})">🪑 Seat anyway</button>`:''}""", "")
sub("Seat them only if they turn up.</div>`;", "Players are set before the session starts.</div>`;")
sub("""    const cur=(S.current.attendance||{})[id],seated=!!courtOfPlayer(id);
    if(!seated||cur==='present')return changePlayerAttendance(id,seated?'absent':'present');""",
    """    const cur=(S.current.attendance||{})[id],seated=!!courtOfPlayer(id);
    // p68: a player without a court tonight is not seated during a session (players are set before it starts).
    if(!seated)return toast('Players are set before the session starts — only players in tonight’s lineup can be marked.','warn');
    if(cur==='present')return changePlayerAttendance(id,'absent');""")

sub("""${seated?'<span class="tag tg-teal">seated</span>':`<button class="btn btn-success btn-sm" style="padding:3px 8px;font-size:10px;margin:0;" onclick="callInSpare(${p.id})">🪑 Seat</button>`}""",
    """${S.current?(courtOfPlayer(p.id)?`<span class="tag tg-teal">seated · Court ${courtOfPlayer(p.id)}</span>`:'<span class="tag">not playing tonight</span>'):seated?'<span class="tag tg-teal">seated</span>':`<button class="btn btn-success btn-sm" style="padding:3px 8px;font-size:10px;margin:0;" onclick="callInSpare(${p.id})">🪑 Seat</button>`}""")

f.write_text(s)
print("p68 applied")
