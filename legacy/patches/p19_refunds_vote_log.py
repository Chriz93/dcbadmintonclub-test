#!/usr/bin/env python3
"""Phase 9: refund list (regulars who declined before Saturday 8 PM) with one-tap 'Mark refunded', and a vote-change
log on the admin's Home (after-deadline and by-admin changes flagged)."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)
rep("    S.invitations=(S_me.organizer&&S_me.verified)?", """    S.rsvpAll=(S_me.organizer&&S_me.verified)?((await sbG('rsvps','select=session_number,player_id,response,updated_at&order=updated_at.asc'))||[]):[];
    S.rsvpLog=(S_me.organizer&&S_me.verified)?((await sbG('rsvp_log','select=id,session_number,player_id,old_response,new_response,by_admin,changed_at&order=id.desc&limit=100'))||[]):[];
    S.invitations=(S_me.organizer&&S_me.verified)?""")
rep("async function togglePaid(id){recordPaymentUI(id);}", r"""async function togglePaid(id){recordPaymentUI(id);}
// Refunds: a regular who declined by the Saturday 8 PM cutoff (72 h before play) is owed $14 for that session.
function refundEligibility(){
  const out=[];const last=upcomingSessionNumber();
  for(let n=1;n<=last;n++){
    const startAt=FD[n-1];if(!startAt)continue;
    const cutoff=new Date(startAt.getTime()-FEES.absenceNoticeHours*3600000);
    const players=(S.rsvpAll||[]).filter(r=>r.session_number===n&&r.response==='notcoming'&&new Date(r.updated_at).getTime()<=cutoff.getTime())
      .map(r=>({r,p:S.players.find(x=>x.id===r.player_id)})).filter(x=>x.p&&x.p.membershipType!=='spare')
      .map(({r,p})=>({id:p.id,name:p.name,decidedAt:new Date(r.updated_at),refund:(S.payments||[]).find(x=>x.kind==='refund'&&x.player_id===p.id&&x.session_number===n)||null}));
    if(players.length||n===last)out.push({n,date:DATES[n-1],cutoff,closed:Date.now()>cutoff.getTime(),players});
  }
  return out;
}
async function markRefunded(id,n){
  try{await rpc('record_payment',{p_player:id,p_kind:'refund',p_amount:FEES.absenceRefund,p_session:n,p_received_on:new Date().toISOString().slice(0,10),p_note:'Declined by the 72-hour cutoff'});await loadAll();renderAll();toast(`$${FEES.absenceRefund} refund recorded`,'success');}
  catch(e){toast('Not recorded: '+e.message,'error');}
}
function renderRefundsCard(){
  const fmt=d=>d.toLocaleString('en-CA',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const sessions=refundEligibility();
  const owed=sessions.reduce((n,s)=>n+s.players.filter(x=>!x.refund).length,0);
  let html=`<div class="card" id="refunds-card"><div class="card-title">💸 Refunds owed ($${FEES.absenceRefund} per declined session)</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Regulars who said “not coming” by Saturday 8:00 PM (72 hours before play) are listed automatically. Mark each one once you have sent the e-transfer.</div>
    <div style="font-size:13px;font-weight:700;margin-bottom:8px;" id="refunds-owed">${owed?`${owed} refund${owed===1?'':'s'} to send · $${owed*FEES.absenceRefund}`:'Nothing owed right now'}</div>`;
  sessions.slice().reverse().forEach(sess=>{
    html+=`<div style="font-size:11px;font-weight:800;color:var(--teal);margin:8px 0 4px;">Session ${sess.n} — ${sess.date} ${sess.closed?'':'<span class="tag tg-yellow">cutoff '+fmt(sess.cutoff)+' — provisional</span>'}</div>`;
    if(!sess.players.length){html+=`<div style="font-size:11px;color:var(--muted);">No eligible declines.</div>`;return;}
    sess.players.forEach(x=>{
      html+=`<div class="refund-row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <span><strong>${esc(x.name)}</strong> <span style="color:var(--muted);">declined ${fmt(x.decidedAt)}</span></span>
        ${x.refund?`<span class="tag tg-green">refunded ${x.refund.received_on}</span>`:`<button class="btn btn-success btn-sm" onclick="markRefunded(${x.id},${sess.n})">Mark refunded</button>`}
      </div>`;
    });
  });
  return html+`</div>`;
}
// Admin Home: who changed their vote, when, and whether it was after the deadline or by the admin.
function renderVoteChanges(){
  const rows=(S.rsvpLog||[]).slice(0,20);
  const fmt=d=>d.toLocaleString('en-CA',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const word=v=>v==='coming'?'coming':v==='notcoming'?'not coming':(v||'—');
  let html=`<div class="card" id="vote-changes"><div class="card-title">🔔 Vote changes</div>`;
  if(!rows.length)return html+`<div style="font-size:12px;color:var(--muted);">No votes yet.</div></div>`;
  rows.forEach(r=>{
    const p=S.players.find(x=>x.id===r.player_id);const at=new Date(r.changed_at);
    const startAt=FD[r.session_number-1];const late=startAt&&at.getTime()>startAt.getTime()-FEES.voteDeadlineHours*3600000&&!r.by_admin;
    html+=`<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
      <span><strong>${esc(p?p.name:'#'+r.player_id)}</strong>: ${word(r.old_response)} → <strong>${word(r.new_response)}</strong> · S${r.session_number}${late?' <span class="tag tg-red">after deadline</span>':''}${r.by_admin?' <span class="tag tg-teal">by admin</span>':''}</span>
      <span style="color:var(--muted);white-space:nowrap;">${fmt(at)}</span>
    </div>`;
  });
  return html+`</div>`;
}""")
rep("  list.innerHTML=\n    (regulars.length?", "  list.innerHTML=renderRefundsCard()+\n    (regulars.length?")
rep("    </div>`;\n  }else if(acl)acl.innerHTML='';", "    </div>`+renderVoteChanges();\n  }else if(acl)acl.innerHTML='';")
p.write_text(s); print("patched")
