#!/usr/bin/env python3
"""Phase 5b: the organizer invites new players from the Registered tab (no database console needed)."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)
rep("    S.payments=(await sbG('payments',", "    S.invitations=(S_me.organizer&&S_me.verified)?((await sbG('invitations','select=email,membership_type,note,created_at&order=created_at.desc'))||[]):[];\n    S.payments=(await sbG('payments',")
rep("async function promoteWaitlisted(id){", """async function invitePlayer(){
  const email=g('inv-email').trim().toLowerCase(),membership_type=g('inv-type')||'regular',note=g('inv-note').trim();
  if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email))return toast('Enter a valid email address','warn');
  if(S.players.some(p=>(p.email||'').toLowerCase()===email))return toast('That email already belongs to a player — they can sign in and register','info');
  const r=await sbP('invitations',{email,membership_type,note});
  if(r&&r.code)return toast('Invitation not saved: '+(r.message||r.code),'error');
  document.getElementById('inv-email').value='';document.getElementById('inv-note').value='';
  await loadAll();renderAll();toast(`Invited ${email} as ${membership_type}. They sign in with that email and register.`,'success');
}
async function deleteInvitation(email){
  if(!confirm(`Withdraw the invitation for ${email}?`))return;
  const r=await sbFetch(`/rest/v1/invitations?email=eq.${encodeURIComponent(email)}`,{method:'DELETE'});
  if(!r.ok)return toast('Not withdrawn','error');
  await loadAll();renderAll();toast('Invitation withdrawn','warn');
}
async function promoteWaitlisted(id){""")
rep("""  html+=`<div class="card"><div class="card-title">📊 Overview</div>""",
"""  const invites=S.invitations||[];
  // Keep whatever the organizer is typing: background syncs re-render this tab every 20 seconds.
  const keep={email:g('inv-email'),type:g('inv-type')||'regular',note:g('inv-note')};
  html+=`<div class="card" id="invite-card"><div class="card-title">✉️ Invite a player</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Returning players just sign in with the email on their record. New players need an invitation: they sign in with this email, register, and you approve them.</div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:start;">
      <input class="inp" id="inv-email" type="email" placeholder="player@email.com" autocomplete="off" style="margin:0;" value="${esc(keep.email)}">
      <select class="inp" id="inv-type" style="margin:0;width:auto;"><option value="regular" ${keep.type==='regular'?'selected':''}>Regular</option><option value="spare" ${keep.type==='spare'?'selected':''}>Spare</option></select>
    </div>
    <input class="inp" id="inv-note" placeholder="Note (optional): who referred them, phone…" maxlength="200" style="margin-top:8px;" value="${esc(keep.note)}">
    <button class="btn btn-primary" onclick="invitePlayer()">Send invitation</button>
    ${invites.length?`<div style="margin-top:10px;">${invites.map(i=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;"><span>${esc(i.email)} <span class="tag ${i.membership_type==='spare'?'tg-yellow':'tg-teal'}">${i.membership_type}</span>${i.note?' <span style="color:var(--muted);">· '+esc(i.note)+'</span>':''}${S.players.some(p=>(p.email||'').toLowerCase()===i.email)?' <span class="tag tg-green">registered</span>':' <span class="tag tg-gray">waiting</span>'}</span><button class="btn btn-ghost btn-sm" onclick="deleteInvitation('${esc(i.email)}')">✕</button></div>`).join('')}</div>`:'<div style="font-size:11px;color:var(--muted);margin-top:8px;">No open invitations.</div>'}
  </div>`;
  html+=`<div class="card"><div class="card-title">📊 Overview</div>""")
# The sign-in hint says who can register.
rep("No password needed. Only confirmed players can register; contact Christy if your email is not recognised.", "No password needed. Use the email Christy has on file (or the one she invited). If registration says it is closed, ask Christy to invite that address.")
# A fresh sign-in always starts the registration wizard at step 1 (never another person's success screen).
rep("""async function afterSignIn(){showGate(false);setSS('syncing');const ok=await loadAll();if(ok){setSS('ok');checkRegistrationStatus();nav('home');""","""async function afterSignIn(){showGate(false);setSS('syncing');regData={};try{goRS(1);}catch(e){}const ok=await loadAll();if(ok){setSS('ok');checkRegistrationStatus();nav('home');""")
p.write_text(s); print("patched")
