# p88 (September 21, 2026): the vote card counts everybody, and the organizer can see who has not answered.
#  From the organizer, looking at Home before Session 2: "I want to see total coming, spares included, and then below
#  may be break down it properly also the vote changes may it look for tabular, by putting coming together and not
#  coming in other group, this is not well formatted etc, also add another section where people who have not responsed
#  on this home screen, coz otherwise its hard for me to know how many spares I have to invite".
#  What was wrong:
#   * the three big numbers counted REGULARS ONLY. With four spares available the card read "18 coming" when 22 people
#     had said yes, and "0 no reply" while two spares had still not answered — the very people the organizer needed to
#     chase. The number that mattered for inviting spares was the one number the card did not show.
#   * Vote changes was a run of sentences ("Name: — → coming · S2"), newest first, with comings and not-comings
#     interleaved, so counting either meant reading every line.
#  Now: the headline counts everyone, a small table underneath splits it into regulars, spares and the total, a new
#  organizer card lists exactly who has not answered (with the 🔔 from p85 beside each of them) and says how many
#  spare seats that leaves to fill, and Vote changes is a table grouped into what people changed TO.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub(""".vote-counts .l{font-size:11px;color:var(--muted);text-transform:uppercase;}""",
    """.vote-counts .l{font-size:11px;color:var(--muted);text-transform:uppercase;}
/* A group heading spans the row, so it must not inherit the last cell's right alignment. */
.vote-tbl .vg td{text-align:left;}
/* .btn is a full-width flex block; inside a cell that stretches it across the column and stacks two buttons.
   In these tables the buttons sit side by side and hug their own width. */
.vote-tbl td .btn{display:inline-flex;width:auto;min-height:30px;padding:5px 9px;vertical-align:middle;}
.vote-tbl td:last-child{width:1%;}
.vote-split td+td,.vote-split th+th{text-align:right;font-variant-numeric:tabular-nums;width:22%;}
.vote-split tr[data-g="total"] td{font-weight:800;border-bottom:none;}
.vote-split td:first-child{color:var(--muted);}
.vote-split tr[data-g="total"] td:first-child{color:var(--text);}""")

# The counts: everyone who was asked, not the regulars alone.
sub("""  const regulars=S.players.filter(isRegularMember);
  const coming = regulars.filter(p=>rsvpData[p.id]==='coming').length;
  const notComing = regulars.filter(p=>rsvpData[p.id]==='notcoming').length;
  const notResponded = regulars.filter(p=>!rsvpData[p.id]).length;""",
    """  const regulars=S.players.filter(isRegularMember);
  // p88: spares were asked too, so they are counted too. The split below keeps the two groups readable.
  const sparesAll=S.players.filter(isSpareMember);
  const tally=list=>({coming:list.filter(p=>rsvpData[p.id]==='coming').length,notcoming:list.filter(p=>rsvpData[p.id]==='notcoming').length,none:list.filter(p=>!rsvpData[p.id]).length});
  const tReg=tally(regulars),tSpare=tally(sparesAll);
  const coming=tReg.coming+tSpare.coming,notComing=tReg.notcoming+tSpare.notcoming,notResponded=tReg.none+tSpare.none;""")

sub("""    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;text-align:center;">
      <div><div style="font-size:20px;font-weight:800;color:var(--green2);">${coming}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Coming</div></div>
      <div><div style="font-size:20px;font-weight:800;color:var(--red2);">${notComing}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Not Coming</div></div>
      <div><div style="font-size:20px;font-weight:800;color:var(--muted);">${notResponded}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">No Reply</div></div>
    </div>""",
    """    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;text-align:center;">
      <div><div style="font-size:20px;font-weight:800;color:var(--green2);" data-k="coming">${coming}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Coming</div></div>
      <div><div style="font-size:20px;font-weight:800;color:var(--red2);" data-k="notcoming">${notComing}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Not Coming</div></div>
      <div><div style="font-size:20px;font-weight:800;color:var(--muted);" data-k="none">${notResponded}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">No Reply</div></div>
    </div>
    ${sparesAll.length?`<div style="overflow-x:auto;margin-bottom:10px;"><table class="vote-tbl vote-split"><thead><tr><th></th><th>Coming</th><th>Not coming</th><th>No reply</th></tr></thead><tbody>
      <tr data-g="regular"><td>Regulars</td><td>${tReg.coming}</td><td>${tReg.notcoming}</td><td>${tReg.none}</td></tr>
      <tr data-g="spare"><td>Spares (available)</td><td>${tSpare.coming}</td><td>${tSpare.notcoming}</td><td>${tSpare.none}</td></tr>
      <tr data-g="total"><td>Total</td><td>${coming}</td><td>${notComing}</td><td>${notResponded}</td></tr>
    </tbody></table></div>`:''}""")

# ── Who has not answered, and what that leaves to fill ────────────────────────────────────────────
sub("""function renderVoteChanges(){""",
    """// p88: the organizer's list of the people the card is still waiting on, and what it means for the spare seats.
function renderNotAnswered(){
  const n=upcomingSessionNumber(),v=S.rsvp||{};
  if(seasonComplete())return '';
  const regs=S.players.filter(p=>isRegularMember(p)&&!v[p.id]),sps=S.players.filter(p=>isSpareMember(p)&&!v[p.id]);
  const seats=spareSeats();
  const fmt=d=>d.toLocaleString('en-CA',{timeZone:LEAGUE_TZ,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  let html=`<div class="card" id="not-answered"><div class="card-title">🔕 Not answered — Session ${n}</div>`;
  // The number that decides how many spares to ask, said plainly.
  html+=`<div style="font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.5;">${seats.decided
    ? `<strong style="color:var(--text);">${seats.open} spare seat${seats.open===1?'':'s'} still to fill.</strong> ${seats.open?`Invite ${seats.open} more spare${seats.open===1?'':'s'}.`:'Every seat is taken.'}`
    : `Spare seats are decided when the regulars' vote closes (${fmt(seats.deadline)}). If it closed now there would be <strong style="color:var(--text);">${seats.seats}</strong>, and ${regs.length} regular${regs.length===1?' has':'s have'} still not answered, so that number can still move.`}</div>`;
  if(!regs.length&&!sps.length)return html+`<div style="font-size:12px;color:var(--muted);">Everybody has answered.</div></div>`;
  html+=`<div style="overflow-x:auto;"><table class="vote-tbl"><tbody>`;
  [{t:'Regulars',list:regs},{t:'Spares',list:sps}].forEach(g=>{
    if(!g.list.length)return;
    html+=`<tr class="vg"><td colspan="2" style="color:var(--muted);">${g.t} (${g.list.length})</td></tr>`;
    g.list.forEach(p=>{
      html+=`<tr class="na-row" data-pid="${p.id}"><td class="vname">${esc(p.name)}${isSpareMember(p)?'<span class="spare-badge">SPARE</span>':''}</td>
        <td><button class="btn btn-ghost btn-sm vote-remind" style="padding:2px 6px;font-size:10px;margin:0;" title="Remind ${esc(p.name)} to answer" onclick="remindOnePlayer(${p.id})">🔔</button></td></tr>`;
    });
  });
  return html+`</tbody></table></div></div>`;
}
function renderVoteChanges(){""")

# ── Vote changes: a table, grouped by what the answer became ──────────────────────────────────────
sub("""  let html=`<div class="card" id="vote-changes"><div class="card-title">🔔 Vote changes</div>`;
  if(!rows.length)return html+`<div style="font-size:12px;color:var(--muted);">No votes yet.</div></div>`;
  rows.forEach(r=>{
    const p=S.players.find(x=>x.id===r.player_id);const at=new Date(r.changed_at);
    const startAt=FD[r.session_number-1];const late=startAt&&at.getTime()>startAt.getTime()-FEES.voteDeadlineHours*3600000&&!r.by_admin;
    html+=`<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
      <span><strong>${esc(p?p.name:'#'+r.player_id)}</strong>: ${word(r.old_response)} → <strong>${word(r.new_response)}</strong> · S${r.session_number}${late?' <span class="tag tg-red">after deadline</span>':''}${r.by_admin?' <span class="tag tg-teal">by admin</span>':''}</span>
      <span style="color:var(--muted);white-space:nowrap;">${fmt(at)}</span>
    </div>`;
  });
  return html+`</div>`;""",
    """  let html=`<div class="card" id="vote-changes"><div class="card-title">🔔 Vote changes</div>`;
  if(!rows.length)return html+`<div style="font-size:12px;color:var(--muted);">No votes yet.</div></div>`;
  // p88: grouped by what the answer became, so the two groups can be counted at a glance instead of read line by line.
  const groups=[{k:'coming',t:'✅ Now coming',c:'var(--green2)'},{k:'notcoming',t:'❌ Now not coming',c:'var(--red2)'}]
    .map(g=>({...g,rows:rows.filter(r=>r.new_response===g.k)}));
  const other=rows.filter(r=>r.new_response!=='coming'&&r.new_response!=='notcoming');
  if(other.length)groups.push({k:'other',t:'Other',c:'var(--muted)',rows:other});
  html+=`<div style="font-size:11px;color:var(--muted);margin-bottom:6px;">The ${rows.length} most recent change${rows.length===1?'':'s'}, newest first in each group.</div>
    <div style="overflow-x:auto;"><table class="vote-tbl"><thead><tr><th>Player</th><th>Was</th><th>Session</th><th>When</th></tr></thead><tbody>`;
  groups.forEach(g=>{
    html+=`<tr class="vg"><td colspan="4" style="color:${g.c};">${g.t} (${g.rows.length})</td></tr>`;
    if(!g.rows.length){html+=`<tr class="vc-empty"><td colspan="4" style="color:var(--muted);">Nobody.</td></tr>`;return;}
    g.rows.forEach(r=>{
      const p=S.players.find(x=>x.id===r.player_id),at=new Date(r.changed_at);
      const startAt=FD[r.session_number-1],late=startAt&&at.getTime()>startAt.getTime()-FEES.voteDeadlineHours*3600000&&!r.by_admin;
      html+=`<tr class="vc-row" data-pid="${r.player_id}">
        <td class="vname">${esc(p?p.name:'#'+r.player_id)}${late?' <span class="tag tg-red">after deadline</span>':''}${r.by_admin?' <span class="tag tg-teal">by admin</span>':''}</td>
        <td style="color:var(--muted);">${r.old_response?word(r.old_response):'no answer'}</td>
        <td>S${r.session_number}</td>
        <td class="vwhen">${fmt(at)}</td>
      </tr>`;
    });
  });
  return html+`</tbody></table></div></div>`;""")

# The new card sits with the other things the organizer reads on Home.
sub("""    </div>`+renderVoteChanges();""",
    """    </div>`+renderNotAnswered()+renderVoteChanges(); // p88""")

f.write_text(s)
print("p88 applied")
