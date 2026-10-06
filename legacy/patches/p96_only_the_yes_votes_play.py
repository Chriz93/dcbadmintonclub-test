# p96 (October 5, 2026): tonight's courts hold the players who said yes, and nobody else.
#  From the organizer: "when I am going to assign courts, only those who responded to votes and said yes should be shown
#  in the courts list, whoever not responded or said no has to be removed from the list" — and why it matters: "its hard
#  for me to know how many spares I have to invite".
#  What was wrong: the line-up excluded only the regulars who had answered "not coming". A regular who had not answered
#  at all was seated on the court they earned, exactly as if they had said yes. So the Courts page, the Assign board, the
#  share image and the session that started from them all counted silence as a yes — and the spare-seat count did too,
#  which is why the number of spares to invite read far too low. On a Monday with 9 of 26 regulars answered, the app
#  showed 24 players on six courts and 0 spare seats, when the night really had 9 players and 15 seats to fill.
#  Now silence is silence. A regular is in tonight's line-up only when they said "coming", or when the organizer marked
#  them present by hand (seating a player does that, p90). The Courts page says in one line who has not answered yet and
#  that they are not seated, the spare-seat count is 24 minus the players who actually said yes, and starting a session
#  records "no answer" against them — no court penalty and no no-show, exactly as a decline costs nothing.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# ── The line-up leaves out everyone who has not answered ─────────────────────────────────────────────────────────────
sub("""  const declined=new Set(S.players.filter(p=>isRegularMember(p)&&votes[p.id]==='notcoming'&&pre[p.id]!=='present'&&!preAbsent.has(p.id)).map(p=>p.id));""",
    """  const declined=new Set(S.players.filter(p=>isRegularMember(p)&&votes[p.id]==='notcoming'&&pre[p.id]!=='present'&&!preAbsent.has(p.id)).map(p=>p.id));
  // p96: a regular who has not answered is not playing. Only "coming", or the organizer's own Present mark, seats them.
  const noAnswer=new Set(S.players.filter(p=>isRegularMember(p)&&!votes[p.id]&&pre[p.id]!=='present'&&!preAbsent.has(p.id)).map(p=>p.id));""")

sub("""  const assign=autoAssign(new Set([...declined,...preAbsent]),confirmedSpares,seatedSpares),nm=id=>S.players.find(p=>p.id===id)?.name||'Player';""",
    """  const assign=autoAssign(new Set([...declined,...preAbsent,...noAnswer]),confirmedSpares,seatedSpares),nm=id=>S.players.find(p=>p.id===id)?.name||'Player'; // p96""")

# One line for the unanswered, not one line each: on a Monday that is most of the league.
sub("""  return{votes,pre,declined,preAbsent,confirmedSpares,assign,notes:[...off,..._lineupNotes],problem:_lineupProblem};""",
    """  // p96: who has not answered, in one line — the organizer needs the count and the names, not 20 sentences.
  const waiting=S.players.filter(p=>p.currentCourt>0&&!isSpareMember(p)&&noAnswer.has(p.id)).sort((a,b)=>a.currentCourt-b.currentCourt||a.id-b.id);
  const names=waiting.slice(0,8).map(p=>`${nm(p.id)} (Court ${p.currentCourt})`).join(', ');
  const silent=waiting.length?[`${waiting.length} regular${waiting.length===1?' has':'s have'} not answered yet, so ${waiting.length===1?'they are':'they are'} not in tonight's line-up: ${names}${waiting.length>8?` and ${waiting.length-8} more`:''}.`]:[];
  return{votes,pre,declined,preAbsent,noAnswer,confirmedSpares,assign,notes:[...off,...silent,..._lineupNotes],problem:_lineupProblem};""")

# ── Starting a session records the silence, and it costs nothing ──────────────────────────────────────────────────────
sub("""  const{votes,pre,declined,preAbsent,confirmedSpares,assign:initAssign,problem}=upcomingLineup();""",
    """  const{votes,pre,declined,preAbsent,noAnswer,confirmedSpares,assign:initAssign,problem}=upcomingLineup(); // p96""")

sub("""  declined.forEach(id=>{attendance[id]='declined';});""",
    """  declined.forEach(id=>{attendance[id]='declined';});
  // p96: silence is not a no-show. "noanswer" is recorded so the night says who never replied; like "declined" it is
  // read by nothing that penalises a player — only "absent" costs a no-show and a court (finalize_session, L23).
  noAnswer.forEach(id=>{const p=S.players.find(x=>x.id===id);if(p&&p.currentCourt>0)attendance[id]='noanswer';});""")

sub("""  await loadAll();renderAll();toast(`Session ${n} started — ${declined.size} excused${preAbsent.size?`, ${preAbsent.size} marked absent`:''}, ${confirmedSpares.length} spare${confirmedSpares.length===1?'':'s'} seated`,'success');""",
    """  await loadAll();renderAll();toast(`Session ${n} started — ${declined.size} excused${noAnswer.size?`, ${noAnswer.size} never answered`:''}${preAbsent.size?`, ${preAbsent.size} marked absent`:''}, ${confirmedSpares.length} spare${confirmedSpares.length===1?'':'s'} seated`,'success');""")

# ── The spare seats count the players who actually said yes ───────────────────────────────────────────────────────────
sub(""" const declined=regulars.filter(p=>vote[p.id]==='notcoming').length,coming=regulars.filter(p=>pre[p.id]!=='absent'&&(vote[p.id]!=='notcoming'||pre[p.id]==='present')).length;""",
    """ // p96: a seat is free unless a regular said yes. Silence used to count as coming, which hid the seats to fill.
 const declined=regulars.filter(p=>vote[p.id]==='notcoming').length,coming=regulars.filter(p=>pre[p.id]!=='absent'&&(vote[p.id]==='coming'||pre[p.id]==='present')).length;""")

# ── The night's summary says who never answered, beside who declined ─────────────────────────────────────────────────
sub("""  // Spares for the session: seats for fewer than 24 regulars coming, decided when the regulars' vote closes (p69)""",
    """  // p96: the regulars who never answered. No penalty either — they are listed so the night is accounted for.
  const silent=Object.entries(att).filter(([,v])=>v==='noanswer').map(([id])=>S.players.find(p=>p.id===parseInt(id))).filter(Boolean);
  if(silent.length){
    html+=`<div class="card" id="silent-tonight"><div class="card-title">🔕 Not playing tonight (never answered)</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">${silent.length} regular${silent.length===1?'':'s'} did not answer the vote — no court penalty and no no-show. Players are set before the session starts.</div>`;
    silent.forEach(p=>{html+=`<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border);">${avatar(p.name,'sm')}<span style="flex:1;font-size:12px;font-weight:700;">${esc(p.name)} <span class="tag tg-gray">no answer</span></span></div>`;});
    html+=`</div>`;
  }
  // Spares for the session: seats for fewer than 24 regulars coming, decided when the regulars' vote closes (p69)""")

f.write_text(s)
print("p96 applied")
