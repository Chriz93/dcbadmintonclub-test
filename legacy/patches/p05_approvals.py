#!/usr/bin/env python3
"""Phase 2d: approval/waitlist/registration columns are the source of truth (mirrored from the legacy blob), sign-out control."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)

# Columns first; the legacy player_approvals blob only fills gaps for rows that predate the columns.
rep("""membershipType:mo[p.id]||kv.membershipType||p.membership_type||'regular',approved:kv.approved!==undefined?kv.approved:(p.approved===undefined?true:!!p.approved),registeredAt:kv.registeredAt||p.registered_at||p.created_at||'',waitlisted:kv.waitlisted!==undefined?kv.waitlisted:!!p.waitlisted,""",
    """membershipType:mo[p.id]||p.membership_type||kv.membershipType||'regular',approved:p.approved!==undefined&&p.approved!==null?!!p.approved:(kv.approved!==undefined?kv.approved:true),registeredAt:p.registered_at||kv.registeredAt||'',waitlisted:p.waitlisted!==undefined&&p.waitlisted!==null?!!p.waitlisted:!!kv.waitlisted,""")
# Every save of the legacy approvals blob also writes the columns, so database rules and the app agree.
rep("""async function setKV(k,v){try{const nv=await rpc('set_state',{k,v:JSON.stringify(v),expected:_stateVersion[k]||0});_stateVersion[k]=nv;}""",
    """async function mirrorApprovals(v){
  for(const[id,a]of Object.entries(v||{})){
    const p=S.players.find(x=>x.id===parseInt(id));if(!p||!a)continue;
    const patch={};
    if(a.approved!==undefined&&!!a.approved!==!!p.approved)patch.approved=!!a.approved;
    if(a.waitlisted!==undefined&&!!a.waitlisted!==!!p.waitlisted)patch.waitlisted=!!a.waitlisted;
    if(a.membershipType&&a.membershipType!==p.membershipType)patch.membership_type=a.membershipType;
    if(Object.keys(patch).length)await sbU('players',id,patch);
  }
}
async function setKV(k,v){try{const nv=await rpc('set_state',{k,v:JSON.stringify(v),expected:_stateVersion[k]||0});_stateVersion[k]=nv;if(k==='player_approvals')await mirrorApprovals(v);}""")
# Sign-out for everyone, next to the sync indicator.
rep("""  <div class="sync-row">
    <div class="sdot" id="sdot"></div>
    <span id="slbl">Connecting</span>
  </div>""","""  <div class="sync-row">
    <div class="sdot" id="sdot"></div>
    <span id="slbl">Connecting</span>
    <button class="btn btn-ghost btn-sm" id="signout-btn" onclick="signOut()" style="margin-left:8px;padding:4px 8px;font-size:10px;">Sign out</button>
  </div>""")
# Sign-in always lands on Home (then registration if needed); sign-out clears session state and relocks organizer tools.
rep("""async function afterSignIn(){showGate(false);setSS('syncing');const ok=await loadAll();if(ok){setSS('ok');checkRegistrationStatus();renderAll();startSync();toast('Signed in as '+myEmail(),'success');registrationFirst();}else{setSS('err');toast('Cannot load league data','error');}}""",
"""async function afterSignIn(){showGate(false);setSS('syncing');const ok=await loadAll();if(ok){setSS('ok');checkRegistrationStatus();nav('home');startSync();toast('Signed in as '+myEmail(),'success');registrationFirst();}else{setSS('err');toast('Cannot load league data','error');}}""")
rep("""async function signOut(){await authSignOut();adminUnlocked=false;userRegistered=false;S_me={organizer:false,verified:false,player_id:null,email:null};S.players=[];signInReset();showGate(true);updateNavVisibility();}""",
"""async function signOut(){await authSignOut();adminUnlocked=false;userRegistered=false;S_me={organizer:false,verified:false,player_id:null,email:null};S.players=[];S.current=null;S.sessions=[];lockAdmin();regData={};try{goRS(1);}catch(e){}signInReset();showGate(true);updateNavVisibility();}""")
p.write_text(s); print("patched")
