#!/usr/bin/env python3
"""Phase 2b: returning players re-register each season; capacity 25; fix shadowed myEmail in renderRegPage."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)
def rep_all(old, new):
    global s
    n = s.count(old); assert n, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new); return n

rep("const SEASON_LABEL='2026–27';","const SEASON_LABEL='2026–27';\nconst SEASON_START='2026-09-01'; // registrations dated before this belong to a previous season\nconst REGULAR_CAPACITY=25;\nfunction registeredThisSeason(p){return !!(p&&p.registeredAt&&p.registeredAt>=SEASON_START);}")
rep_all("regularCount>=24","regularCount>=REGULAR_CAPACITY")
rep_all("24/24","25/25")
rep("const remaining=24-regularCount;","const remaining=REGULAR_CAPACITY-regularCount;")

# renderRegPage: fix the shadowed name; returning players see the form prefilled until they re-register this season
rep("""  const myEmail=myEmail(),already=document.getElementById('reg-already'),form=document.getElementById('reg-form');""",
    """  const myEmailAddr=myEmail(),already=document.getElementById('reg-already'),form=document.getElementById('reg-form');""")
rep("""  if(myEmail){
    const me=S.players.find(p=>p.email.toLowerCase()===myEmail.toLowerCase());
    if(me){""","""  const emailInp=document.getElementById('r-email');
  if(emailInp&&myEmailAddr){emailInp.value=myEmailAddr;emailInp.readOnly=true;emailInp.style.opacity='0.7';}
  if(myEmailAddr){
    const me=myPlayer();
    if(me&&!registeredThisSeason(me)){
      // Returning player: details on file, but every season needs a fresh registration and agreement.
      already.style.display='block';form.style.display='block';
      already.innerHTML=`<div class="alert alert-info">👋 Welcome back, <strong>${esc(me.name)}</strong>. A new season needs a fresh registration and agreement. Your details are filled in below — check them and submit.</div>`;
      const nm=document.getElementById('r-name');if(nm&&!nm.value)nm.value=me.name||'';
      const ph=document.getElementById('r-phone');if(ph&&!ph.value)ph.value=me.phone||'';
      const em=document.getElementById('r-emergency');if(em&&!em.value)em.value=me.emergency||'';
      const md=document.getElementById('r-medical');if(md&&!md.value)md.value=me.medical||'';
    }else if(me){""")
# regStep1: the sign-in email is the registration email; an existing own row is allowed (re-registration)
rep("""  const name=g('r-name').trim(),email=g('r-email').trim(),phone=g('r-phone').trim(),emergency=g('r-emergency').trim();""",
    """  const name=g('r-name').trim(),email=(myEmail()||g('r-email')).trim().toLowerCase(),phone=g('r-phone').trim(),emergency=g('r-emergency').trim();""")
rep("""  if(S.players.find(p=>p.email.toLowerCase()===email.toLowerCase())){toast('Email already registered!','warn');return;}""",
    """  const existing=S.players.find(p=>(p.email||'').toLowerCase()===email);
  if(existing&&registeredThisSeason(existing)){toast('You already registered this season — Christy will approve it','warn');return;}""")
p.write_text(s); print("patched")
