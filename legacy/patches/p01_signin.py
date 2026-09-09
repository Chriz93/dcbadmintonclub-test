#!/usr/bin/env python3
"""Phase 1 patch: email one-time-code sign-in, organizer second factor, versioned state, per-player RSVP/Q&A.
Run from the repository root: python3 legacy/patches/p01_signin.py. Every replacement asserts its anchor exists."""
import re, sys, pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1, flags=0):
    global s
    if flags:
        n = len(re.findall(old, s, flags))
        assert n >= count, f"anchor missing: {old[:60]!r}"
        s = re.sub(old, new, s, count=count, flags=flags)
    else:
        assert old in s, f"anchor missing: {old[:60]!r}"
        s = s.replace(old, new, count)

# ── 1. Data layer: session, refresh, MFA, versioned state ─────────────────────────────────────────
start = s.index("const H={'Content-Type':'application/json','apikey':SK,'Authorization':'Bearer '+SK};")
end = s.index("// ══════════════════════════════════════════════\n// STATE")
s = s[:start] + r"""// ── Sign-in session (email one-time code). Tokens live in localStorage so a phone stays signed in between Tuesdays. ──
let _session=null;
function loadSession(){try{_session=JSON.parse(localStorage.getItem('dcbc-session')||'null');}catch(e){_session=null;}return _session;}
function saveSession(x){_session=x;if(x)localStorage.setItem('dcbc-session',JSON.stringify(x));else localStorage.removeItem('dcbc-session');}
function decodeAal(t){try{return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).aal||'aal1';}catch(e){return 'aal1';}}
function sessionFrom(j){return {access_token:j.access_token,refresh_token:j.refresh_token,expires_at:j.expires_at||(Math.floor(Date.now()/1000)+(j.expires_in||3600)),user:{id:j.user?.id,email:(j.user?.email||'').toLowerCase()},aal:decodeAal(j.access_token)};}
function myEmail(){return _session?.user?.email||null;}
function authHeaders(){return {'Content-Type':'application/json','apikey':SK,'Authorization':'Bearer '+(_session?_session.access_token:SK)};}
let _refreshing=null;
async function ensureSession(){
  if(!_session)return null;
  if(Date.now()/1000<_session.expires_at-90)return _session;
  if(!_refreshing)_refreshing=(async()=>{try{const r=await fetch(SB+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json','apikey':SK},body:JSON.stringify({refresh_token:_session.refresh_token})});if(!r.ok){saveSession(null);return null;}saveSession(sessionFrom(await r.json()));return _session;}catch(e){return _session;}finally{_refreshing=null;}})();
  return _refreshing;
}
async function authRequestCode(email){const r=await fetch(SB+'/auth/v1/otp',{method:'POST',headers:{'Content-Type':'application/json','apikey':SK},body:JSON.stringify({email,create_user:true})});if(!r.ok){const t=await r.json().catch(()=>({}));throw new Error(t.msg||t.error_description||t.message||'Could not send the code');}}
async function authVerifyCode(email,code){const r=await fetch(SB+'/auth/v1/verify',{method:'POST',headers:{'Content-Type':'application/json','apikey':SK},body:JSON.stringify({email,token:code,type:'email'})});const j=await r.json().catch(()=>({}));if(!r.ok||!j.access_token)throw new Error(j.msg||j.error_description||'Code expired or invalid');saveSession(sessionFrom(j));return _session;}
async function authSignOut(){try{await fetch(SB+'/auth/v1/logout',{method:'POST',headers:authHeaders()});}catch(e){}saveSession(null);}
// Organizer second factor (authenticator app). Verification upgrades the token to aal2, which the database checks.
async function mfaFactors(){const r=await fetch(SB+'/auth/v1/user',{headers:authHeaders()});const j=await r.json();return (j.factors||[]).filter(f=>f.factor_type==='totp'&&f.status==='verified');}
async function mfaEnroll(){const r=await fetch(SB+'/auth/v1/factors',{method:'POST',headers:authHeaders(),body:JSON.stringify({factor_type:'totp',friendly_name:'Organizer '+new Date().toISOString().slice(0,10)})});const j=await r.json();if(!r.ok)throw new Error(j.msg||j.error||'Cannot set up authenticator');return j;}
async function mfaVerify(factorId,code){const c=await fetch(SB+'/auth/v1/factors/'+factorId+'/challenge',{method:'POST',headers:authHeaders()});const cj=await c.json();if(!c.ok)throw new Error(cj.msg||'Challenge failed');const v=await fetch(SB+'/auth/v1/factors/'+factorId+'/verify',{method:'POST',headers:authHeaders(),body:JSON.stringify({challenge_id:cj.id,code})});const vj=await v.json();if(!v.ok||!vj.access_token)throw new Error(vj.msg||vj.error_description||'Wrong code');saveSession(sessionFrom(vj));return _session;}
// ── REST helpers: every request carries the signed-in token; the database rules decide what is allowed. ──
async function sbFetch(path,opts={}){await ensureSession();const r=await fetch(SB+path,{...opts,headers:{...authHeaders(),...(opts.headers||{})}});if(r.status===401&&_session){saveSession(null);showGate(true);throw new Error('Signed out — please sign in again');}return r;}
async function sbG(t,f=''){const q=f.includes('order=')?f:`${f}&order=created_at.asc`;const r=await sbFetch(`/rest/v1/${t}?${q}`);if(!r.ok)throw new Error(`Load ${t} failed (${r.status})`);return r.json();}
async function sbP(t,d){const r=await sbFetch(`/rest/v1/${t}`,{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(d)});const j=await r.json().catch(()=>({}));if(!r.ok)return {code:String(r.status),message:j.message||j.hint||'Save refused'};return j;}
async function sbU(t,id,d){const r=await sbFetch(`/rest/v1/${t}?id=eq.${id}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(d)});const j=await r.json().catch(()=>({}));if(!r.ok){toast('⚠️ Save refused: '+(j.message||r.status),'error');return {code:String(r.status),message:j.message};}return j;}
async function sbD(t,id){const r=await sbFetch(`/rest/v1/${t}?id=eq.${id}`,{method:'DELETE'});if(!r.ok)toast('⚠️ Delete refused','error');}
async function sbUps(t,d,conflict=''){
  const url=`/rest/v1/${t}${conflict?`?on_conflict=${conflict}`:''}`;
  const r=await sbFetch(url,{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify(d)});
  if(!r.ok){const txt=await r.text();throw new Error(`sbUps ${t} ${r.status}: ${txt.substring(0,200)}`);}
  return r.json();
}
async function rpc(fn,args){const r=await sbFetch(`/rest/v1/rpc/${fn}`,{method:'POST',body:JSON.stringify(args||{})});const txt=await r.text();let j=null;try{j=txt?JSON.parse(txt):null;}catch(e){j=txt;}if(!r.ok){const err=new Error((j&&j.message)||'Request refused');err.code=j&&j.code;err.status=r.status;throw err;}return j;}
// ── Shared state with versions: a stale screen can never overwrite newer data. ──
const _stateVersion={};
async function getKV(k){try{const r=await sbG('app_state',`key=eq.${encodeURIComponent(k)}&select=key,value,version`);if(r&&r[0]){_stateVersion[k]=r[0].version||0;return JSON.parse(r[0].value);}return null;}catch(e){return null;}}
async function setKV(k,v){try{const nv=await rpc('set_state',{k,v:JSON.stringify(v),expected:_stateVersion[k]||0});_stateVersion[k]=nv;}catch(e){if(e.code==='40001'||/Stale state/.test(e.message||'')){toast('⚠️ Someone else saved newer changes — reloading','warn');await loadAll();renderAll();throw e;}console.error('setKV failed:',k,e);toast('⚠️ Save failed: '+String(e.message||'check connection').substring(0,80),'error');throw e;}}
async function deleteKV(k){await rpc('delete_state',{k});delete _stateVersion[k];}

""" + s[end:]

# ── 2. Sign-in card replaces the invite-code gate ──────────────────────────────────────────────
rep("""    <h2>🏸 DC Badminton Club</h2>
    <p>Enter your invite code to continue</p>
    <input type="text" class="invite-inp" id="invite-code-input" placeholder="INVITE CODE" autocomplete="off">
    <button class="invite-btn" onclick="submitInviteCode()">Enter</button>
    <div class="invite-err" id="invite-err"></div>""",
"""    <h2>🏸 Maplewood League</h2>
    <p id="signin-hint">Sign in with your email. We'll send you a one-time code.</p>
    <input type="email" class="invite-inp" id="signin-email-input" placeholder="you@email.com" autocomplete="email" style="text-transform:none;letter-spacing:0;" onkeydown="if(event.key==='Enter')signInStep()">
    <input type="text" class="invite-inp" id="signin-code-input" placeholder="6-DIGIT CODE" inputmode="numeric" autocomplete="one-time-code" maxlength="8" style="display:none;" onkeydown="if(event.key==='Enter')signInStep()">
    <button class="invite-btn" id="signin-btn" onclick="signInStep()">Send code</button>
    <button class="invite-btn" id="signin-back" onclick="signInReset()" style="display:none;background:transparent;border:1px solid var(--border);color:var(--muted);">Use a different email</button>
    <div class="invite-err" id="invite-err"></div>
    <div style="font-size:11px;color:var(--muted);margin-top:14px;">No password needed. Only confirmed players can register; contact Christy if your email is not recognised.</div>""")

# ── 3. Auth flow functions replace invite gate, email lookup sign-in ───────────────────────────
start = s.index("let inviteGateActive = true;")
end = s.index("function updateNavVisibility(){")
s = s[:start] + r"""let userRegistered = false;
let S_me={organizer:false,verified:false,player_id:null,email:null};
let _signinEmail='';
function showGate(show){const g=document.getElementById('invite-gate');if(g)g.classList.toggle('hidden',!show);}
function signInReset(){_signinEmail='';const c=document.getElementById('signin-code-input'),e=document.getElementById('signin-email-input');if(!c||!e)return;c.style.display='none';c.value='';e.style.display='';document.getElementById('signin-btn').textContent='Send code';document.getElementById('signin-back').style.display='none';document.getElementById('signin-hint').textContent="Sign in with your email. We'll send you a one-time code.";document.getElementById('invite-err').textContent='';}
async function signInStep(){
  const err=document.getElementById('invite-err');err.textContent='';const btn=document.getElementById('signin-btn');btn.disabled=true;
  try{
    if(!_signinEmail){
      const email=(document.getElementById('signin-email-input').value||'').trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){err.textContent='Enter a valid email';return;}
      await authRequestCode(email);_signinEmail=email;
      document.getElementById('signin-email-input').style.display='none';
      const c=document.getElementById('signin-code-input');c.style.display='';c.focus();
      btn.textContent='Verify code';document.getElementById('signin-back').style.display='';
      document.getElementById('signin-hint').textContent='Code sent to '+email+'. Enter it below (check spam if it does not arrive).';
    }else{
      const code=(document.getElementById('signin-code-input').value||'').trim();
      if(code.length<6){err.textContent='Enter the code from your email';return;}
      await authVerifyCode(_signinEmail,code);
      await afterSignIn();
    }
  }catch(e){err.textContent='❌ '+(e.message||'Try again');}
  finally{btn.disabled=false;}
}
async function afterSignIn(){showGate(false);setSS('syncing');const ok=await loadAll();if(ok){setSS('ok');checkRegistrationStatus();renderAll();startSync();toast('Signed in as '+myEmail(),'success');}else{setSS('err');toast('Cannot load league data','error');}}
async function initAuth(){loadSession();if(!_session){showGate(true);return false;}const x=await ensureSession();if(!x){showGate(true);return false;}showGate(false);return true;}
async function signOut(){await authSignOut();adminUnlocked=false;userRegistered=false;S_me={organizer:false,verified:false,player_id:null,email:null};S.players=[];signInReset();showGate(true);updateNavVisibility();}
async function refreshMe(){try{const r=await rpc('admin_status');if(r)S_me=r;}catch(e){S_me={organizer:false,verified:false,player_id:null,email:myEmail()};}}
function myPlayer(){const em=myEmail();return S.players.find(p=>p.id===S_me.player_id)||(em?S.players.find(p=>(p.email||'').toLowerCase()===em):null)||null;}
function checkRegistrationStatus(){
  const me=myPlayer();
  userRegistered = !!(me && me.approved);
  if(S_me.organizer&&S_me.verified&&!adminUnlocked){adminUnlocked=true;applyAdminUnlock();}
  updateNavVisibility();
}
// Returning players used to type an email; now everyone signs in with a code.
function showSignIn(){signOut();}
function doSignIn(){signInStep();}

""" + s[end:]

# ── 4. RSVP per player (own row in the database, changeable until the organizer closes it) ─────
start = s.index("async function submitRSVP(coming){")
end = s.index("async function loadAll(){")
s = s[:start] + r"""async function submitRSVP(coming){
  if(!S.current) return toast('No active session', 'warn');
  const me=myPlayer();
  if(!me) return toast('Not registered', 'warn');
  const response=coming?'coming':'notcoming';
  try{
    await rpc('set_rsvp',{p_session:S.current.number,p_player:me.id,p_response:response});
    S.rsvp={...(S.rsvp||{}),[me.id]:response};
    renderRSVP();
    toast(coming ? 'You are coming! 🎉' : 'Noted - see you next time!', 'success');
  }catch(e){toast('RSVP not saved: '+e.message,'error');}
}

function renderRSVP(){
  const el = document.getElementById('sec-vote');
  if(!el) return;
  if(!S.current){
    el.innerHTML = '<div class="alert alert-warn">No active session</div>';
    return;
  }
  const rsvpData = S.rsvp || {};
  const me=myPlayer();
  const myRsvp = me ? rsvpData[me.id] : undefined;
  const coming = Object.values(rsvpData).filter(v => v === 'coming').length;
  const notComing = Object.values(rsvpData).filter(v => v === 'notcoming').length;
  const total = S.players.filter(p=>p.approved).length;
  const notResponded = Math.max(0, total - Object.keys(rsvpData).length);

  let html = `<div class="alert alert-info">📋 RSVP for Session ${S.current.number}</div>`;
  html += `<div class="card"><div class="card-title">Attendance Confirmation</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;text-align:center;">
      <div><div style="font-size:20px;font-weight:800;color:var(--green2);">${coming}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Coming</div></div>
      <div><div style="font-size:20px;font-weight:800;color:var(--red2);">${notComing}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Not Coming</div></div>
      <div><div style="font-size:20px;font-weight:800;color:var(--muted);">${notResponded}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">No Reply</div></div>
    </div>`;
  if(me){
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button class="btn ${myRsvp==='coming'?'btn-success':'btn-ghost'}" onclick="submitRSVP(true)" style="margin:0;">✅ I'm Coming</button>
      <button class="btn ${myRsvp==='notcoming'?'btn-danger':'btn-ghost'}" onclick="submitRSVP(false)" style="margin:0;">❌ Not Coming</button>
    </div>`;
    if(myRsvp) html += `<div class="alert alert-success" style="text-align:center;margin-top:10px;">${myRsvp === 'coming' ? '✅ You confirmed - See you there!' : '❌ Noted - Sit this one out'} · You can change your answer above.</div>`;
  }else{
    html += `<div class="alert alert-warn">Your registration must be approved before you can RSVP.</div>`;
  }
  html += `</div>`;

  if(adminUnlocked){
    html += `<div class="card"><div class="card-title">📋 RSVP Status</div>`;
    S.players.filter(p=>p.approved).forEach(p => {
      const status = rsvpData[p.id];
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:700;">${esc(p.name)}</div>
        <span class="tag ${status === 'coming' ? 'tg-green' : status === 'notcoming' ? 'tg-red' : 'tg-gray'}">
          ${status === 'coming' ? '✅ Coming' : status === 'notcoming' ? '❌ Not Coming' : '⏳ Not Responded'}
        </span>
      </div>`;
    });
    html += `</div>`;
  }
  el.innerHTML = html;
}

""" + s[end:]

# ── 5. loadAll: organizer sees full rows, players see the public view plus their own row ─────────
rep("""    const[pl,an,cur,sess]=await Promise.all([sbG('players'),sbG('announcements','order=created_at.desc'),getKV('current_session'),getKV('completed_sessions')]);""",
"""    if(!_session)return false;
    await refreshMe();
    const loadPlayers=async()=>{
      if(S_me.organizer&&S_me.verified)return sbG('players');
      const[pub,mine]=await Promise.all([sbG('players_public'),sbG('players')]);
      const m=new Map((pub||[]).map(p=>[p.id,p]));(mine||[]).forEach(p=>m.set(p.id,{...(m.get(p.id)||{}),...p}));
      return[...m.values()];
    };
    const[pl,an,cur,sess]=await Promise.all([loadPlayers(),sbG('announcements','order=created_at.desc'),getKV('current_session'),getKV('completed_sessions')]);""")
rep("""waiverSigned:(p.waiver_signed&&p.sig!=='admin')||(!!(p.sig&&p.sig!=='admin')),""",
"""waiverSigned:p.waiver_ok!==undefined?!!p.waiver_ok:((p.waiver_signed&&p.sig!=='admin')||(!!(p.sig&&p.sig!=='admin'))),""")
rep("""    if(S.current){S.votes=await getKV(`votes_session_${S.current.number}`)||{};S.rsvp=await getKV(`rsvp_session_${S.current.number}`)||{};}
    S.qaQuestions=await getKV('qa_questions')||[];""",
"""    if(S.current){
      S.votes=await getKV(`votes_session_${S.current.number}`)||{};
      const rows=await sbG('rsvps',`session_number=eq.${S.current.number}&select=player_id,response,updated_at&order=updated_at.asc`);
      S.rsvp={};(rows||[]).forEach(r=>{S.rsvp[r.player_id]=r.response;});
    }else S.rsvp={};
    S.qaQuestions=((await sbG('questions','select=id,player_id,asker,question,answer,answered_at,created_at&order=created_at.asc'))||[]).map(q=>({id:q.id,playerId:q.player_id,playerName:q.asker,question:q.question,answer:q.answer,ts:q.created_at,answeredAt:q.answered_at}));""")
rep("""  }catch(e){return false;}
}

let _isSyncing=false;
function startSync(){setInterval(async()=>{_isSyncing=true;setSS('syncing');try{await loadAll();renderAll();setSS('ok');}catch(e){setSS('err');}finally{_isSyncing=false;}},15000);}""",
"""  }catch(e){console.error('loadAll',e);return false;}
}

let _isSyncing=false,_syncTimer=null;
function startSync(){if(_syncTimer)return;_syncTimer=setInterval(async()=>{if(document.hidden||!_session||_isSyncing)return;_isSyncing=true;setSS('syncing');try{if(await loadAll()){renderAll();setSS('ok');}else setSS('err');}catch(e){setSS('err');}finally{_isSyncing=false;}},20000);}""")

# ── 6. Organizer access: authenticator app instead of a PIN ─────────────────────────────────────
rep("""      <div style="font-size:18px;font-weight:800;margin-bottom:8px;">Admin Access</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:20px;">Enter your PIN to continue</div>
      <input class="inp" type="password" id="pin-inp" placeholder="••••••" style="text-align:center;font-size:26px;letter-spacing:10px;max-width:200px;display:block;margin:0 auto 10px;" maxlength="8" onkeydown="if(event.key==='Enter')checkPin()">
      <button class="btn btn-primary" style="max-width:220px;margin:0 auto;" onclick="checkPin()">Unlock</button>""",
"""      <div style="font-size:18px;font-weight:800;margin-bottom:8px;">Organizer Access</div>
      <div id="admin-lock-msg" style="font-size:13px;color:var(--muted);margin-bottom:20px;">Checking your account…</div>
      <div id="mfa-qr" style="margin:0 auto 12px;"></div>
      <input class="inp" type="text" id="pin-inp" placeholder="123456" inputmode="numeric" autocomplete="one-time-code" style="text-align:center;font-size:26px;letter-spacing:10px;max-width:220px;display:block;margin:0 auto 10px;" maxlength="8" onkeydown="if(event.key==='Enter')checkPin()">
      <button class="btn btn-primary" style="max-width:220px;margin:0 auto;" onclick="checkPin()">Verify</button>""")
start = s.index("async function checkPin(){")
end = s.index("// ══════════════════════════════════════════════\n// HOME")
s = s[:start] + r"""let _mfaFactor=null;
async function prepareAdminLock(){
  const msg=document.getElementById('admin-lock-msg'),qr=document.getElementById('mfa-qr');if(!msg)return;qr.innerHTML='';_mfaFactor=null;
  if(!_session){msg.textContent='Sign in with the organizer email first.';return;}
  await refreshMe();
  if(!S_me.organizer){msg.textContent='This account ('+esc(myEmail()||'')+') is not an organizer account.';return;}
  if(S_me.verified){adminUnlocked=true;applyAdminUnlock();return;}
  try{
    const factors=await mfaFactors();
    if(factors.length){_mfaFactor=factors[0].id;msg.textContent='Enter the 6-digit code from your authenticator app.';}
    else{
      const e=await mfaEnroll();_mfaFactor=e.id;
      const src=e.totp.qr_code.startsWith('data:')?e.totp.qr_code:'data:image/svg+xml;utf8,'+encodeURIComponent(e.totp.qr_code);
      qr.innerHTML='<img src="'+src+'" style="width:180px;height:180px;background:#fff;padding:6px;border-radius:8px;" alt="Authenticator setup code"><div style="font-size:11px;color:var(--muted);margin-top:6px;word-break:break-all;">Or type this key into your authenticator app: '+esc(e.totp.secret)+'</div>';
      msg.textContent='First time here: scan with Google Authenticator (or similar), then enter the 6-digit code.';
    }
  }catch(e){msg.textContent='Authenticator unavailable: '+e.message;}
}
async function checkPin(){
  const v=(document.getElementById('pin-inp').value||'').trim();const e=document.getElementById('pin-err');
  if(!_mfaFactor||!v){e.style.display='block';e.textContent='Enter the authenticator code';setTimeout(()=>e.style.display='none',2500);return;}
  try{
    await mfaVerify(_mfaFactor,v);await refreshMe();
    if(!S_me.verified)throw new Error('Verification was not accepted');
    document.getElementById('pin-inp').value='';
    adminUnlocked=true;applyAdminUnlock();
    await loadAll();renderAll();
  }catch(err){e.style.display='block';e.textContent='❌ '+err.message;document.getElementById('pin-inp').value='';setTimeout(()=>e.style.display='none',3000);}
}
function applyAdminUnlock(){
  document.getElementById('admin-lock').style.display='none';
  document.getElementById('admin-panel').style.display='block';
  updateNavVisibility();
  document.getElementById('page-courts').classList.add('admin-mode');
}
function lockAdmin(){
  adminUnlocked=false;
  document.getElementById('admin-lock').style.display='block';
  document.getElementById('admin-panel').style.display='none';
  document.getElementById('page-courts').classList.remove('admin-mode');
  renderAll();
}
async function changePin(){toast('PINs are retired: organizer access uses your authenticator app','warn');}

""" + s[end:]
rep("""        <div class="card-title">🔑 Change PIN</div>
        <div class="alert alert-info" style="margin-bottom:10px;">PIN is never shown publicly. Only change it here.</div>
        <input class="inp" type="password" id="pin1" placeholder="New PIN (min 4 digits)">
        <input class="inp" type="password" id="pin2" placeholder="Confirm new PIN">
        <button class="btn btn-primary" onclick="changePin()">Update PIN</button>
        <div id="pin-msg" style="font-size:12px;margin-top:6px;"></div>""",
"""        <div class="card-title">🔑 Organizer Security</div>
        <div class="alert alert-info" style="margin-bottom:10px;">Organizer actions require your email sign-in plus an authenticator code. There is no PIN any more. Signing out removes access from this device.</div>
        <button class="btn btn-ghost" onclick="signOut()">Sign out of this device</button>
        <div id="pin-msg" style="font-size:12px;margin-top:6px;"></div>""")
rep("""  if(el)el.classList.add('active');
  else{const btn=document.getElementById('bnav-'+page);if(btn)btn.classList.add('active');}
  renderAll();
}""","""  if(el)el.classList.add('active');
  else{const btn=document.getElementById('bnav-'+page);if(btn)btn.classList.add('active');}
  if(page==='admin'&&!adminUnlocked)prepareAdminLock();
  renderAll();
}""")

# ── 7. Registration writes only the caller's own record through the database function ──────────
rep("""    let result=await sbP('players',{name:regData.name,email:regData.email,phone:regData.phone,emergency:regData.emergency,medical:regData.medical,sig:sig,waiver_signed:true,paid:false,current_court:0,highest_court:0,season_wins:0,season_losses:0,games_played:0});
    if(result?.code||result?.message){
      result=await sbP('players',{name:regData.name,email:regData.email,phone:regData.phone,emergency:regData.emergency,medical:regData.medical,sig:sig,paid:false,current_court:0,highest_court:0,season_wins:0,season_losses:0,games_played:0});
      if(result?.code||result?.message){toast('Registration error: '+(result.message||'Unknown error'),'error');btn.disabled=false;btn.innerHTML='Submit Registration →';return;}
    }
    // Store approval/waitlist/membership status in KV (works regardless of DB schema)
    const playerId=result?.[0]?.id||result?.id;
    if(playerId){
      const approvals=await getKV('player_approvals')||{};
      approvals[playerId]={approved:false,waitlisted:regData.waitlisted||false,membershipType:regData.membershipType||'regular',registeredAt:new Date().toISOString(),waiverSig:regData.waiverSig||''};
      await setKV('player_approvals',approvals);
    }
    localStorage.setItem('dcbc-email',regData.email);""",
"""    regData.email=myEmail();
    let playerId;
    try{playerId=await rpc('register_me',{p_name:regData.name,p_phone:regData.phone||'',p_emergency:regData.emergency||'',p_medical:regData.medical||'',p_sig:sig,p_membership:regData.membershipType||'regular'});}
    catch(e){toast('Registration error: '+(e.message||'Unknown error'),'error');btn.disabled=false;btn.innerHTML='Submit Registration →';return;}""")

# ── 8. Questions live in their own table ───────────────────────────────────────────────────────
start = s.index("async function submitQuestion(){")
end = s.index("function renderQA(){")
s = s[:start] + r"""async function submitQuestion(){
  const me=myPlayer();
  if(!me||!me.approved)return toast('Must be registered and approved','warn');
  const qtext=g('qa-input').trim();if(!qtext){toast('Enter your question','warn');return;}
  const r=await sbP('questions',{player_id:me.id,asker:me.name,question:qtext});
  if(r?.code){toast('Question not saved: '+(r.message||''),'error');return;}
  document.getElementById('qa-input').value='';
  await loadAll();renderAll();toast('Question submitted!','success');
}
async function answerQuestion(id){
  const ans=prompt('Enter your answer:');if(!ans||!ans.trim())return;
  const r=await sbU('questions',id,{answer:ans.trim(),answered_at:new Date().toISOString()});
  if(r?.code)return;
  await loadAll();renderAll();toast('Answer posted!','success');
}
async function deleteQuestion(id){
  if(!confirm('Delete this question?'))return;
  await sbD('questions',id);
  await loadAll();renderAll();toast('Deleted','warn');
}
""" + s[end:]
rep("""    const isOwn=q.playerEmail===email;""","""    const isOwn=q.playerId===S_me.player_id;""")

# ── 9. Start-up: session first, no realtime socket, sign-out control ───────────────────────────
rep("""async function init(){
  await initInviteGate();
  setSS('syncing');
  const ok=await loadAll();""","""async function init(){
  signInReset();
  const signed=await initAuth();
  if(!signed){setSS('err');updateNavVisibility();registerServiceWorker();return;}
  setSS('syncing');
  const ok=await loadAll();""")
rep("""    checkRegistrationStatus();renderAll();startSync();startRealtime();setInterval(renderHome,30000);registerServiceWorker();""",
"""    checkRegistrationStatus();renderAll();startSync();setInterval(renderHome,30000);registerServiceWorker();""")
rep(r"localStorage\.getItem\('dcbc-email'\)", "myEmail()", count=1, flags=re.M)
s = s.replace("localStorage.getItem('dcbc-email')", "myEmail()")
s = re.sub(r"localStorage\.setItem\('dcbc-email',[^;]*\);", "void 0;", s)
assert "localStorage.getItem('dcbc-email')" not in s and "localStorage.setItem('dcbc-email'" not in s
rep("""    <div class="nav-sub">Maplewood League · Apr–May 2026</div>""","""    <div class="nav-sub">Maplewood Advanced League · 2026–27</div>""")
rep("""<div class="nav-title"><span>DC</span> Badminton Club</div>""","""<div class="nav-title"><span>Maplewood</span> League</div>""")

p.write_text(s)
print("patched", len(s), "bytes")
