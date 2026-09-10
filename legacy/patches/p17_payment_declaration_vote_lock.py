#!/usr/bin/env python3
"""Phase 8: players declare membership and payment at registration; the status card no longer nags for e-transfer;
voting is final 48 hours before play (regulars) — only the admin can change an answer after that."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)

# ── Registration: season-fee declaration under the membership choice ─────────────────────────────
rep("""              <div style="font-size:11px;color:var(--teal2);margin-top:4px;">No cap · Always open</div>
            </div>
          </label>
        </div>
      </div>""",
"""              <div style="font-size:11px;color:var(--teal2);margin-top:4px;">No cap · Always open</div>
            </div>
          </label>
        </div>
        <div id="reg-payment-block" style="background:var(--s2);border:1px solid var(--border);border-radius:12px;padding:12px;">
          <div class="lbl" style="margin-bottom:8px;">Season fee</div>
          <label class="chk-row" id="pay-decl-paid-row"><input type="radio" name="pay-decl" value="paid_full" onchange="regData.payment=this.value"><span>I have already e-transferred the full <strong>$400</strong> to christygeorge993@gmail.com</span></label>
          <label class="chk-row" id="pay-decl-will-row"><input type="radio" name="pay-decl" value="will_pay" checked onchange="regData.payment=this.value"><span>I will e-transfer <strong>$400</strong> before the first session</span></label>
          <label class="chk-row" id="pay-decl-spare-row" style="display:none;"><input type="radio" name="pay-decl" value="per_session" onchange="regData.payment=this.value"><span>Spare: I pay <strong>$20</strong> per session I play</span></label>
        </div>
      </div>""")
rep("""function selectMembership(type){
  regData.membershipType=type;""",
"""function selectMembership(type){
  regData.membershipType=type;
  const spare=type==='spare';
  const row=id=>document.getElementById(id);
  if(row('pay-decl-spare-row'))row('pay-decl-spare-row').style.display=spare?'':'none';
  if(row('pay-decl-paid-row'))row('pay-decl-paid-row').style.display=spare?'none':'';
  if(row('pay-decl-will-row'))row('pay-decl-will-row').style.display=spare?'none':'';
  const pick=document.querySelector(`input[name="pay-decl"][value="${spare?'per_session':'will_pay'}"]`);
  if(pick&&!(document.querySelector('input[name="pay-decl"]:checked')&&document.querySelector('input[name="pay-decl"]:checked').closest('label').style.display!=='none')){pick.checked=true;regData.payment=pick.value;}""")
rep("p_sig:sig,p_membership:regData.membershipType||'", "p_payment:regData.payment||(regData.membershipType==='spare'?'per_session':'will_pay'),p_sig:sig,p_membership:regData.membershipType||'")
rep("""    if(payNote){payNote.style.display=regData.membershipType==='spare'?'none':'block';}""",
"""    if(payNote){payNote.style.display=regData.membershipType==='spare'?'none':'block';payNote.innerHTML=regData.payment==='paid_full'?'✅ You told us the $400 is already sent — the admin will confirm it against the bank record.':'⚠️ E-transfer $400 to:<br><strong>christygeorge993@gmail.com</strong><br><small>Use your name as the message</small>';}""")
# Status card: what the player said and whether the admin has confirmed — no e-transfer box here.
rep("""          ${!me.paid&&!isSpare?`<div class="alert alert-warn" style="margin-top:10px;">E-transfer $400 to <strong>christygeorge993@gmail.com</strong></div>`:''}
          ${isSpare&&!me.paid?`<div class="alert alert-info" style="margin-top:10px;">💡 As a spare, you pay $20 per session when called in. E-transfer to christygeorge993@gmail.com before or on the session date.</div>`:''}""",
"""          <div style="font-size:12px;margin-top:4px;" id="reg-fee-line">Season fee: ${isSpare?'<strong>$20 per session played</strong>':me.paid?'<span style="color:var(--green2);">✅ Confirmed by the admin</span>':me.declaredPayment==='paid_full'?'<span style="color:var(--yellow2);">⏳ You reported it sent — awaiting the admin\\'s confirmation</span>':'<span style="color:var(--yellow2);">⏳ Not yet paid</span>'}</div>""")
rep("      return{id:p.id,emailReminders:p.email_reminders!==false,", "      return{id:p.id,emailReminders:p.email_reminders!==false,declaredPayment:p.declared_payment||'',")
# Pay tab: the player's own declaration next to the ledger status.
rep("""        <div style="font-size:11px;color:${b.due===0&&b.owed>0?'var(--green2)':'var(--yellow2)'};" class="pay-status">${status}</div>""",
    """        <div style="font-size:11px;color:${b.due===0&&b.owed>0?'var(--green2)':'var(--yellow2)'};" class="pay-status">${status}${p.declaredPayment==='paid_full'&&b.due>0?' · <strong>player says: sent in full</strong>':p.declaredPayment==='will_pay'&&b.due>0?' · player says: will pay':''}</div>""")

# ── Voting is final 48 hours before play; the admin can still change any answer ──────────────────
rep("""async function submitRSVP(coming){
  if(seasonComplete()) return toast('The season is complete', 'warn');
  const me=myPlayer();
  if(!me) return toast('Not registered', 'warn');""",
"""function voteLocked(p){ // regulars only; spares keep claiming seats until the night
  if(!p||isSpareMember(p)||adminUnlocked)return false;
  const startAt=FD[upcomingSessionNumber()-1];if(!startAt)return false;
  return Date.now()>startAt.getTime()-FEES.voteDeadlineHours*3600000;
}
async function adminSetVote(playerId,response){
  if(!adminUnlocked)return toast('Organizer verification required','warn');
  try{await rpc('set_rsvp',{p_session:upcomingSessionNumber(),p_player:playerId,p_response:response});await loadAll();renderAll();toast('Answer updated for '+(S.players.find(p=>p.id===playerId)?.name||'player'),'success');}
  catch(e){toast('Not updated: '+e.message,'error');}
}
async function submitRSVP(coming){
  if(seasonComplete()) return toast('The season is complete', 'warn');
  const me=myPlayer();
  if(!me) return toast('Not registered', 'warn');
  if(voteLocked(me)) return toast('Voting closed 48 hours before play. Message the admin in the group to change your answer.', 'warn');""")
rep("""      const beforeDeadline=now<=deadline.getTime(),beforeCutoff=now<=cutoff.getTime();
      html += `<div class="vote-timing" style="font-size:11px;color:${beforeDeadline?'var(--muted)':'var(--yellow2)'};margin-bottom:8px;">${beforeDeadline?`Vote by <strong>${fmt(deadline)}</strong> (48 hours before play). `:`The voting deadline (${fmt(deadline)}) has passed — please answer now; spares may already be seated. `}${beforeCutoff?`$${FEES.absenceRefund} refund if you decline by ${fmt(cutoff)}.`:`The 72-hour refund window closed ${fmt(cutoff)}.`}</div>`;""",
"""      const beforeDeadline=now<=deadline.getTime(),beforeCutoff=now<=cutoff.getTime();
      html += `<div class="vote-timing" style="font-size:11px;color:${beforeDeadline?'var(--muted)':'var(--yellow2)'};margin-bottom:8px;">${beforeDeadline?`Vote by <strong>${fmt(deadline)}</strong> (48 hours before play) — after that your answer is final. `:`Voting closed ${fmt(deadline)}. To change your answer, message the admin in the group — only the admin can update it now. `}${beforeCutoff?`$${FEES.absenceRefund} refund if you decline by ${fmt(cutoff)}.`:`The 72-hour refund window closed ${fmt(cutoff)}.`}</div>`;""")
rep("""    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button class="btn ${myRsvp==='coming'?'btn-success':'btn-ghost'}" onclick="submitRSVP(true)" style="margin:0;">✅ ${meSpare?"I'm available":"I'm Coming"}</button>
      <button class="btn ${myRsvp==='notcoming'?'btn-danger':'btn-ghost'}" onclick="submitRSVP(false)" style="margin:0;">❌ ${meSpare?'Not available':'Not Coming'}</button>
    </div>`;""",
"""    const locked=voteLocked(me);
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button class="btn ${myRsvp==='coming'?'btn-success':'btn-ghost'}" onclick="submitRSVP(true)" style="margin:0;" ${locked?'disabled':''}>✅ ${meSpare?"I'm available":"I'm Coming"}</button>
      <button class="btn ${myRsvp==='notcoming'?'btn-danger':'btn-ghost'}" onclick="submitRSVP(false)" style="margin:0;" ${locked?'disabled':''}>❌ ${meSpare?'Not available':'Not Coming'}</button>
    </div>`;
    if(locked)html += `<div class="alert alert-warn vote-locked" style="margin-top:10px;">🔒 Voting is closed for this session${myRsvp?` — your answer is <strong>${myRsvp==='coming'?'coming':'not coming'}</strong>`:' — you did not answer'}. Any change needs the admin: message the group.</div>`;""")
# Admin: change any player's answer from the RSVP status list.
rep("""        <div style="font-size:13px;font-weight:700;">${esc(p.name)}${isSpareMember(p)?'<span class="spare-badge">SPARE</span>':''}</div>${tagFor(p)}""",
    """        <div style="font-size:13px;font-weight:700;">${esc(p.name)}${isSpareMember(p)?'<span class="spare-badge">SPARE</span>':''}</div><div style="display:flex;gap:4px;align-items:center;">${tagFor(p)}<button class="btn btn-ghost btn-sm admin-vote" style="padding:2px 6px;font-size:10px;margin:0;" title="Set coming" onclick="adminSetVote(${p.id},'coming')">✅</button><button class="btn btn-ghost btn-sm admin-vote" style="padding:2px 6px;font-size:10px;margin:0;" title="Set not coming" onclick="adminSetVote(${p.id},'notcoming')">❌</button></div>""")
# Rules card sentence
rep("by <strong>Sunday 8:00 PM</strong> (48 hours before play). Decline by Saturday 8:00 PM", "by <strong>Sunday 8:00 PM</strong> (48 hours before play); after that the answer is final and only the admin can change it (message the group). Decline by Saturday 8:00 PM")
p.write_text(s); print("patched")
