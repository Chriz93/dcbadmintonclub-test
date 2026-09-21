# p85 (September 20, 2026): the RSVP list becomes a per-session table, and each silent player can be reminded on their own.
#  From the organizer: "make the vote changes more tabular like per session wise, also list all players regular and
#  spares, who reposnded yes, not coming and who didnt respond at all, and make a small email remainder tab beside them
#  to remind about voting".
#  Before: one flat list of names with a tag each, for the upcoming session only, and a single "send to everyone who
#  has not answered" button. There was no way to look at an earlier session's answers, and no way to nudge one person.
#  Now: a session picker (every session up to the upcoming one), three counted groups — coming, not coming, no answer —
#  and a table row per player showing their type, their answer and when they gave it. A 🔔 button sits beside each
#  player who has not answered for the UPCOMING session; it queues the same vote reminder the bulk button sends, for
#  that one player. Email is still sent by the scheduled job, never by the browser: the page only queues the request.
#  Answers for a session that has already been played are shown but not editable — that night is over.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""#_t:empty{display:none;}""",
    """#_t:empty{display:none;}
.vote-tbl{width:100%;border-collapse:collapse;font-size:12px;}
.vote-tbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);font-weight:800;padding:4px 8px 6px 0;border-bottom:1px solid var(--border);white-space:nowrap;}
.vote-tbl td{padding:7px 8px 7px 0;border-bottom:1px solid var(--border);vertical-align:middle;}
.vote-tbl td:last-child,.vote-tbl th:last-child{padding-right:0;text-align:right;white-space:nowrap;}
.vote-tbl .vg td{padding:10px 0 4px;border-bottom:none;font-size:11px;font-weight:800;letter-spacing:0.3px;}
.vote-tbl .vname{font-weight:700;}
.vote-tbl .vwhen{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;}
.vote-counts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;margin-bottom:10px;}
.vote-counts .v{font-size:20px;font-weight:800;}
.vote-counts .l{font-size:11px;color:var(--muted);text-transform:uppercase;}""")

# The session being looked at. Null means "the upcoming one", so a new session moves the table along by itself.
sub("""async function adminSetVote(playerId,response){""",
    """let _voteSess=null; // p85: which session's answers the RSVP table is showing (null = the upcoming one)
function voteTableSession(){const up=upcomingSessionNumber();return _voteSess&&_voteSess>=1&&_voteSess<=up?_voteSess:up;}
function setVoteSession(v){const n=parseInt(v);_voteSess=isNaN(n)?null:n;renderRSVP();}
// Every answer on record for one session: the latest row wins, because rsvpAll arrives oldest first.
function voteAnswersFor(n){
  const out={};
  (S.rsvpAll||[]).filter(r=>r.session_number===n).forEach(r=>{out[r.player_id]={response:r.response,at:r.updated_at};});
  if(n===upcomingSessionNumber())(S.rsvpRows||[]).forEach(r=>{out[r.player_id]={response:r.response,at:r.updated_at};});
  return out;
}
async function adminSetVote(playerId,response){""")

# The table itself, in place of the flat list.
sub("""  if(adminUnlocked&&!compact){
    const tagFor=(p)=>{const st=rsvpData[p.id];if(isSpareMember(p)){const c=seats.claims.find(x=>x.id===p.id);return st==='coming'?(c&&c.confirmed?'<span class="tag tg-green">✅ Seat confirmed</span>':c?.reserved?'<span class="tag tg-yellow">Seat reserved — payment pending</span>':seats.decided?'<span class="tag tg-yellow">⏳ Standby</span>':'<span class="tag tg-yellow">⏳ Available</span>'):st==='notcoming'?'<span class="tag tg-red">❌ Not available</span>':'<span class="tag tg-gray">⏳ No answer</span>';}
      return `<span class="tag ${st === 'coming' ? 'tg-green' : st === 'notcoming' ? 'tg-red' : 'tg-gray'}">${st === 'coming' ? '✅ Coming' : st === 'notcoming' ? '❌ Not Coming' : '⏳ Not Responded'}</span>`;};
    html += `<div class="card"><div class="card-title">📋 RSVP Status</div>`;
    [...S.players.filter(isRegularMember),...S.players.filter(isSpareMember)].forEach(p => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:700;">${esc(p.name)}${isSpareMember(p)?'<span class="spare-badge">SPARE</span>':''}</div><div style="display:flex;gap:4px;align-items:center;">${tagFor(p)}<button class="btn btn-ghost btn-sm admin-vote" style="padding:2px 6px;font-size:10px;margin:0;" title="Set coming" onclick="adminSetVote(${p.id},'coming')">✅</button><button class="btn btn-ghost btn-sm admin-vote" style="padding:2px 6px;font-size:10px;margin:0;" title="Set not coming" onclick="adminSetVote(${p.id},'notcoming')">❌</button></div>
      </div>`;
    });
    html += `</div>`;
  }""",
    """  if(adminUnlocked&&!compact)html+=renderVoteTable(seats);""")

# p85: one table, one session at a time, grouped by what each player answered.
sub("""let _activeLoads=0;""",
    """// p85: the organizer's view of who has answered — one session at a time, grouped by the answer, regulars then spares.
function renderVoteTable(seats){
  const up=upcomingSessionNumber(),n=voteTableSession(),live=n===up;
  const ans=voteAnswersFor(n);
  const people=[...S.players.filter(isRegularMember),...S.players.filter(isSpareMember)];
  const respOf=p=>(ans[p.id]||{}).response||'';
  const groups=[{k:'coming',t:'✅ Coming',c:'var(--green2)'},{k:'notcoming',t:'❌ Not coming',c:'var(--red2)'},{k:'',t:'⏳ No answer',c:'var(--muted)'}]
    .map(g=>({...g,rows:people.filter(p=>respOf(p)===g.k)}));
  const when=x=>{if(!x)return '—';const d=new Date(x);return isNaN(d)?'—':d.toLocaleString('en-CA',{timeZone:LEAGUE_TZ,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});};
  // A spare's answer means "available", and their seat says more than the answer does.
  const seatTag=p=>{const c=(seats&&seats.claims||[]).find(x=>x.id===p.id);if(!c)return '';
    return c.confirmed?'<span class="tag tg-green">Seat confirmed</span>':c.reserved?'<span class="tag tg-yellow">Seat reserved — unpaid</span>':seats.decided?'<span class="tag tg-yellow">Standby</span>':'<span class="tag tg-yellow">Available</span>';};
  let html=`<div class="card" id="vote-table"><div class="card-title">📋 RSVP Status</div>
    <label class="lbl" for="vote-sess">Session</label>
    <select class="inp" id="vote-sess" onchange="setVoteSession(this.value)" style="margin-bottom:10px;">`;
  for(let i=up;i>=1;i--)html+=`<option value="${i}"${i===n?' selected':''}>Session ${i}${DATES[i-1]?' — '+DATES[i-1]:''}${i===up?' (upcoming)':''}</option>`;
  html+=`</select>
    <div class="vote-counts">${groups.map(g=>`<div><div class="v" style="color:${g.c};">${g.rows.length}</div><div class="l">${g.t.slice(2)}</div></div>`).join('')}</div>`;
  if(!live)html+=`<div style="font-size:11px;color:var(--muted);margin-bottom:8px;">Session ${n} has been played — these answers are the record and cannot be changed.</div>`;
  html+=`<div style="overflow-x:auto;"><table class="vote-tbl"><thead><tr><th>Player</th><th>Type</th><th>Answered</th><th></th></tr></thead><tbody>`;
  groups.forEach(g=>{
    html+=`<tr class="vg"><td colspan="4" style="color:${g.c};">${g.t} (${g.rows.length})</td></tr>`;
    if(!g.rows.length){html+=`<tr class="vote-empty"><td colspan="4" style="color:var(--muted);">Nobody.</td></tr>`;return;}
    g.rows.forEach(p=>{
      const sp=isSpareMember(p);
      html+=`<tr class="vote-row" data-pid="${p.id}">
        <td class="vname">${esc(p.name)}</td>
        <td>${sp?'<span class="spare-badge">SPARE</span>':'<span style="color:var(--muted);">Regular</span>'}${sp&&live&&g.k==='coming'?' '+seatTag(p):''}</td>
        <td class="vwhen">${when((ans[p.id]||{}).at)}</td>
        <td>${live?`${g.k===''?`<button class="btn btn-ghost btn-sm vote-remind" style="padding:2px 6px;font-size:10px;margin:0;" title="Remind ${esc(p.name)} to answer" onclick="remindOnePlayer(${p.id})">🔔</button>`:''}<button class="btn btn-ghost btn-sm admin-vote" style="padding:2px 6px;font-size:10px;margin:0;" title="Set coming" onclick="adminSetVote(${p.id},'coming')">✅</button><button class="btn btn-ghost btn-sm admin-vote" style="padding:2px 6px;font-size:10px;margin:0;" title="Set not coming" onclick="adminSetVote(${p.id},'notcoming')">❌</button>`:''}</td>
      </tr>`;
    });
  });
  return html+`</tbody></table></div></div>`;
}
let _activeLoads=0;""")

# One player's reminder: the same vote reminder the bulk button sends, addressed to them alone.
sub("""// Email is sent by the scheduled job, never by the browser: these buttons only queue the request.
async function requestReminderRun(kind){
  if(!adminUnlocked)return toast('Organizer verification required','warn');
  const n=upcomingSessionNumber();
  if(kind==='vote'&&!confirm(`Send vote reminders for Session ${n} to everyone who has not answered?\\n\\nWhile the league is in test mode these go to the league inbox, not to players.`))return;""",
    """// p85: remind one player who has not answered. Same email, same job — only the recipient list is narrowed.
async function remindOnePlayer(id){
  if(!adminUnlocked)return toast('Organizer verification required','warn');
  const p=S.players.find(x=>x.id===id);if(!p)return toast('Player not found','warn');
  const n=upcomingSessionNumber();
  if(!confirm(`Send ${p.name} a reminder to answer for Session ${n}?\\n\\nWhile the league is in test mode it goes to the league inbox, not to the player.`))return;
  return requestReminderRun('vote',[id]);
}
// Email is sent by the scheduled job, never by the browser: these buttons only queue the request.
async function requestReminderRun(kind,players){
  if(!adminUnlocked)return toast('Organizer verification required','warn');
  const n=upcomingSessionNumber();
  const one=Array.isArray(players)&&players.length===1?S.players.find(x=>x.id===players[0]):null;
  if(kind==='vote'&&!players&&!confirm(`Send vote reminders for Session ${n} to everyone who has not answered?\\n\\nWhile the league is in test mode these go to the league inbox, not to players.`))return;""")
sub("""    await setKV('reminder_request',{kind,id:String(Date.now()),at:new Date().toISOString(),session:n,by:myEmail(),to:myEmail()});""",
    """    await setKV('reminder_request',{kind,id:String(Date.now()),at:new Date().toISOString(),session:n,by:myEmail(),to:myEmail(),...(Array.isArray(players)&&players.length?{players}:{})}); // p85""")
sub("""    toast(kind==='smoke'?`Sending the test email to ${myEmail()} now…`:`Sending reminders for Session ${n} now…`,'success');""",
    """    toast(kind==='smoke'?`Sending the test email to ${myEmail()} now…`:one?`Reminding ${one.name} about Session ${n} now…`:`Sending reminders for Session ${n} now…`,'success');""")

f.write_text(s)
print("p85 applied")
