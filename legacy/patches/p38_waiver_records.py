# p38 (September 12, 2026): versioned waiver wording and acceptance records (migration L20).
#  - Registration step 2 shows the exact current waiver wording from the database (waiver_versions), with its version.
#    The page checks the wording's SHA-256 against the database's own, and sends the version and digest back with the
#    registration, so the record names exactly the words that were on screen. If the waiver changed meanwhile, the
#    registration is refused and the new wording is shown.
#  - Step 2 asks who is accepting (an adult participant, or a parent/guardian for a named participant under 18) and,
#    when the wording makes it optional, a separate photo/video box. Signature 2–80 characters.
#  - A registered player who has not accepted the current version sees a Home card to read and accept it
#    (accept_waiver); nothing is ever back-filled for anyone.
#  - Admin → 🖋 Waivers (organizer only): the versions (wording download, make current), every player's acceptances,
#    a readable per-person record download (exact wording, version, fingerprint, identity, UTC and league-time
#    timestamps, the device's time zone, how it was accepted, the registration reference, later acceptances) and a CSV
#    of all acceptances. People without a record are shown as such; the old "📄 Export" (which printed a paraphrase of
#    today's terms for anyone) now downloads this record instead.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

# ── Step 2: the wording comes from the database ──
a = s.index('<div class="card-title">Waiver & Rules</div>')
b = s.index('      </div>\n      <button class="btn btn-primary" id="reg-btn" onclick="regStep2()">', a)
s = s[:a] + """<div class="card-title">Waiver</div>
        <div class="wv-meta" id="waiver-meta" aria-live="polite"></div>
        <div class="waiver-box" id="waiver-box" tabindex="0" role="region" aria-label="Waiver text"><div class="wv-loading">Loading the waiver…</div></div>
        <fieldset class="wv-age"><legend class="lbl">Who is accepting?</legend>
          <label class="chk-row"><input type="radio" name="wv-age" id="wv-age-adult" value="adult" checked onchange="wvAgeChanged()"><span>I am 18 or older and I am the participant</span></label>
          <label class="chk-row"><input type="radio" name="wv-age" id="wv-age-guardian" value="guardian" onchange="wvAgeChanged()"><span>I am a parent or legal guardian registering a participant under 18</span></label>
          <div id="wv-minor-row" hidden><label class="lbl" for="wv-minor">Participant's full name *</label><input class="inp" id="wv-minor" autocomplete="off" placeholder="Full name of the participant under 18"></div>
        </fieldset>
        <label class="chk-row" id="wv-media-row" hidden><input type="checkbox" id="wv-media"><span>Optional: I agree to photos and video of me (or the participant) being used to promote the league, as the waiver describes. I can withdraw this at any time.</span></label>
        <div class="chk-row" style="background:rgba(22,163,74,0.08);border:1px solid rgba(22,163,74,0.3);border-radius:8px;padding:10px 12px;">
          <input type="checkbox" id="w1">
          <label for="w1" style="font-weight:700;">I have read this waiver, I understand it, and I accept it<span id="wv-ver-inline"></span>.</label>
        </div>
        <label class="lbl" for="r-sig" style="margin-top:8px;">Digital Signature (type full name) *</label>
        <input class="inp" id="r-sig" placeholder="Your full name as signature" autocomplete="name">
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">Typing your name and ticking the box is your electronic signature. The exact wording, its version and the time you accept are recorded.</div>
""" + s[b:]
sub("""async function regStep2(){
  // The payment acknowledgement is the season-fee choice on step 1; this step is the waiver alone.
  if(!document.getElementById('w1')?.checked){toast('Please tick the box to accept the waiver to continue','warn');return;}
  const sig=g('r-sig').trim();if(!sig){toast('Enter digital signature','warn');return;}
  regData.waiverSig=sig;goRS(3);
}""", """async function regStep2(){
  // The payment acknowledgement is the season-fee choice on step 1; this step is the waiver alone.
  if(!S.waiver||!S.waiver.body)return toast(S.waiverError||'The waiver has not loaded yet — check the connection and try again','warn');
  if(!document.getElementById('w1')?.checked){toast('Please tick the box to accept the waiver to continue','warn');return;}
  const age=document.querySelector('input[name="wv-age"]:checked')?.value;
  if(!age)return toast('Choose who is accepting the waiver','warn');
  const minor=g('wv-minor').trim();
  if(age==='guardian'&&(minor.length<2||minor.length>80))return toast('Enter the full name of the participant under 18','warn');
  const sig=g('r-sig').trim();if(!sig){toast('Enter digital signature','warn');return;}
  if(sig.length<2||sig.length>80)return toast('Type your full name (2 to 80 characters) as your signature','warn');
  const mediaRow=document.getElementById('wv-media-row');
  regData.waiverSig=sig;
  regData.waiver={version:S.waiver.version,sha:S.waiver.sha,sig,age,minor:age==='guardian'?minor:'',media:mediaRow&&!mediaRow.hidden?!!document.getElementById('wv-media')?.checked:null};
  goRS(3);
}
// The waiver arguments sent with a registration: the version and digest shown, and how and where it was accepted.
function waiverArgs(){const w=regData.waiver||{};let tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(e){}
  return {p_waiver_version:w.version||'',p_waiver_sha:w.sha||'',p_waiver_sig:w.sig||regData.waiverSig||'',p_tz:tz,p_offset:-new Date().getTimezoneOffset(),p_age:w.age||'adult',p_minor:w.minor||'',p_media:w.media===undefined?null:w.media,p_ua:(navigator.userAgent||'').slice(0,300)};}""")
sub("p_sig:sig,p_membership", "p_sig:sig,...waiverArgs(),p_membership")
sub("""    catch(e){toast('Registration error: '+(e.message||'Unknown error'),'error');btn.disabled=false;btn.innerHTML='Submit Registration →';return;}""",
    """    catch(e){const m=e.message||'Unknown error';if(/waiver/i.test(m)){S.waiver=null;await ensureWaiver();goRS(2);}toast('Registration error: '+m,'error');btn.disabled=false;btn.innerHTML='Submit Registration →';return;}""")
sub("function renderRegPage(){", "function renderRegPage(){\n  ensureWaiver();")

# ── Loading: the current version for everyone; acceptances (own, or all for the organizer) ──
sub("""    S.pastPlayers=(S_me.organizer&&S_me.verified)?((await sbG('past_players','select=*&order=name.asc'))||[]):[];""",
    """    S.pastPlayers=(S_me.organizer&&S_me.verified)?((await sbG('past_players','select=*&order=name.asc'))||[]):[];
    S.waiverCurrent=((await sbG('waiver_versions','is_current=eq.true&select=version,title,published_at'))||[])[0]||null;
    S.waiverAcc=(S_me.player_id||S_me.organizer)?((await sbG('waiver_acceptances','select=id,player_id,user_id,email,participant_name,typed_signature,waiver_version,waiver_sha256,accepted_at,client_timezone,client_utc_offset_minutes,action,age_declaration,minor_name,media_consent,registration_ref,user_agent&order=accepted_at.asc,id.asc'))||[]):[];
    if(S.waiver&&S.waiverCurrent&&S.waiver.version!==S.waiverCurrent.version){S.waiver=null;S.waiverVersions=null;}""")

WAIVER_JS = r"""
// ══════════════════════════════════════════════
// WAIVER RECORDS (L20)
// ══════════════════════════════════════════════
// The exact current wording comes from the database; the page shows it and sends back its version and SHA-256 when
// someone accepts, so every record names the words that were on screen. Records are never changed or back-filled.
const LEAGUE_TZ='America/Toronto';
async function sha256Hex(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
// Wording format: "# " title, "## " section heading, "• " list item, blank line between paragraphs. Everything escaped.
function waiverHtml(body){
  const out=[];let para=[],list=[];
  const endList=()=>{if(list.length){out.push(`<ul class="wv-list">${list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`);list=[];}};
  const endPara=()=>{if(para.length){out.push(`<p>${para.map(esc).join('<br>')}</p>`);para=[];}};
  for(const line of String(body).split('\n')){
    if(!line.trim()){endList();endPara();continue;}
    if(line.startsWith('## ')){endList();endPara();out.push(`<h4>${esc(line.slice(3))}</h4>`);continue;}
    if(line.startsWith('# ')){endList();endPara();out.push(`<p class="wv-title"><strong>${esc(line.slice(2))}</strong></p>`);continue;}
    if(line.startsWith('• ')){endPara();list.push(line.slice(2));continue;}
    endList();para.push(line);
  }
  endList();endPara();return out.join('');
}
const waiverOffersMedia=body=>/separate and optional/i.test(body||'');
async function loadWaiver(){
  const rows=await sbG('waiver_versions','is_current=eq.true&select=version,title,body,sha256,published_at');
  const w=rows&&rows[0];if(!w){S.waiver=null;throw new Error('No waiver is published yet — registration opens when the organizer publishes one.');}
  let sha='';try{sha=await sha256Hex(w.body);}catch(e){throw new Error('This browser cannot check the waiver text. Open the site over https in an up-to-date browser.');}
  if(w.sha256&&sha!==w.sha256)throw new Error('The waiver text did not arrive intact — reload the page.');
  S.waiver={version:w.version,title:w.title,body:w.body,sha,published_at:w.published_at};return S.waiver;
}
async function ensureWaiver(){
  if(S.waiver||S._waiverLoading)return renderWaiverBox();
  S._waiverLoading=true;
  try{S.waiverError='';await loadWaiver();}catch(e){S.waiverError=e.message||'The waiver could not be loaded — check the connection and try again.';}
  finally{S._waiverLoading=false;renderWaiverBox();}
}
function renderWaiverBox(){
  const box=document.getElementById('waiver-box');if(!box)return;
  const meta=document.getElementById('waiver-meta'),inl=document.getElementById('wv-ver-inline'),media=document.getElementById('wv-media-row'),w=S.waiver;
  if(!w){box.innerHTML=`<div class="wv-loading${S.waiverError?' wv-error':''}" role="${S.waiverError?'alert':'status'}">${esc(S.waiverError||'Loading the waiver…')}</div>`;delete box.dataset.version;if(meta)meta.textContent='';if(inl)inl.textContent='';return;}
  if(box.dataset.version!==w.version){box.innerHTML=waiverHtml(w.body);box.dataset.version=w.version;}
  if(meta)meta.innerHTML=`<span class="tag tg-teal">Version ${esc(w.version)}</span> <span>${esc(w.title)}</span>`;
  if(inl)inl.textContent=` (version ${w.version})`;
  if(media)media.hidden=!waiverOffersMedia(w.body);
}
function wvAgeChanged(){const v=document.querySelector('input[name="wv-age"]:checked')?.value;const r=document.getElementById('wv-minor-row');if(r)r.hidden=v!=='guardian';}
// ── A registered player who has not accepted the current version: a Home card to read and accept it ──
function needsWaiverUpdate(){
  const me=myPlayer(),cur=S.waiverCurrent;
  return !!(me&&cur&&registeredThisSeason(me)&&!(S.waiverAcc||[]).some(a=>a.player_id===me.id&&a.waiver_version===cur.version));
}
function renderWaiverPrompt(){
  const el=document.getElementById('home-waiver');if(!el)return;
  if(!needsWaiverUpdate()){el.innerHTML='';return;}
  const cur=S.waiverCurrent,had=(S.waiverAcc||[]).some(a=>a.player_id===myPlayer().id);
  el.innerHTML=`<div class="card" id="waiver-update-card"><div class="card-title">🖋 Waiver</div>
    <div style="font-size:13px;margin-bottom:8px;">${had?`The league waiver has a new version (${esc(cur.version)}). Please read it and accept it.`:`Please read the league waiver (version ${esc(cur.version)}) and accept it, so your acceptance is on record.`}</div>
    <button class="btn btn-primary" id="waiver-update-btn" onclick="openWaiverAccept()">Read and accept</button></div>`;
}
async function openWaiverAccept(){
  try{await loadWaiver();}catch(e){return toast(e.message,'error');}
  const w=S.waiver;
  openModal(`Waiver — version ${w.version}`,`<div class="waiver-box" id="wva-box" tabindex="0" role="region" aria-label="Waiver text">${waiverHtml(w.body)}</div>
    <fieldset class="wv-age"><legend class="lbl">Who is accepting?</legend>
      <label class="chk-row"><input type="radio" name="wva-age" value="adult" checked onchange="document.getElementById('wva-minor-row').hidden=true"><span>I am 18 or older and I am the participant</span></label>
      <label class="chk-row"><input type="radio" name="wva-age" value="guardian" onchange="document.getElementById('wva-minor-row').hidden=false"><span>I am a parent or legal guardian of a participant under 18</span></label>
      <div id="wva-minor-row" hidden><label class="lbl" for="wva-minor">Participant's full name *</label><input class="inp" id="wva-minor" autocomplete="off"></div></fieldset>
    ${waiverOffersMedia(w.body)?`<label class="chk-row"><input type="checkbox" id="wva-media"><span>Optional: I agree to photos and video of me (or the participant) being used to promote the league, as the waiver describes.</span></label>`:''}
    <div class="chk-row"><input type="checkbox" id="wva-ok"><label for="wva-ok" style="font-weight:700;">I have read this waiver, I understand it, and I accept it (version ${esc(w.version)}).</label></div>
    <label class="lbl" for="wva-sig">Type your full name *</label><input class="inp" id="wva-sig" autocomplete="name">
    <button class="btn btn-primary" id="wva-btn" onclick="acceptWaiverUpdate()">✓ Accept version ${esc(w.version)}</button>`);
}
let _wvAccepting=false;
async function acceptWaiverUpdate(){
  const w=S.waiver;if(_wvAccepting||!w)return;
  if(!document.getElementById('wva-ok')?.checked)return toast('Please tick the box to accept the waiver','warn');
  const age=document.querySelector('input[name="wva-age"]:checked')?.value||'adult',minor=(document.getElementById('wva-minor')?.value||'').trim(),sig=(document.getElementById('wva-sig')?.value||'').trim();
  if(age==='guardian'&&(minor.length<2||minor.length>80))return toast('Enter the full name of the participant under 18','warn');
  if(sig.length<2||sig.length>80)return toast('Type your full name (2 to 80 characters) as your signature','warn');
  const mediaEl=document.getElementById('wva-media');let tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(e){}
  _wvAccepting=true;const b=document.getElementById('wva-btn');if(b){b.disabled=true;b.textContent='Saving…';}
  try{
    await rpc('accept_waiver',{p_version:w.version,p_sha:w.sha,p_sig:sig,p_tz:tz,p_offset:-new Date().getTimezoneOffset(),p_age:age,p_minor:age==='guardian'?minor:'',p_media:mediaEl?mediaEl.checked:null,p_ua:(navigator.userAgent||'').slice(0,300)});
    closeModal();await loadAll();renderAll();toast(`Thank you — your acceptance of waiver version ${w.version} is recorded`,'success');
  }catch(e){toast('Not recorded: '+(e.message||'check the connection'),'error');if(/waiver/i.test(e.message||''))S.waiver=null;}
  finally{_wvAccepting=false;if(b&&b.isConnected){b.disabled=false;b.textContent=`✓ Accept version ${w.version}`;}}
}
// ── Admin → 🖋 Waivers ──
async function ensureAllWaiverVersions(force){if(!force&&S.waiverVersions&&S.waiverVersions.length)return;S.waiverVersions=(await sbG('waiver_versions','select=version,title,body,sha256,published_at,is_current,note&order=version.asc'))||[];}
function fmtWhen(iso){return new Date(iso).toLocaleString('en-CA',{timeZone:LEAGUE_TZ,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});}
function renderWaiverAdmin(load){
  const el=document.getElementById('sec-a-wv');if(!el)return;
  if(load)ensureAllWaiverVersions(true).then(()=>renderWaiverAdmin()).catch(e=>toast('Waiver versions not loaded: '+(e.message||'check the connection'),'error'));
  const vs=S.waiverVersions||[],acc=S.waiverAcc||[],cur=S.waiverCurrent,of=id=>acc.filter(a=>a.player_id===id);
  const players=S.players.filter(p=>registeredThisSeason(p)||of(p.id).length).sort((x,y)=>x.name.localeCompare(y.name));
  const gone=acc.filter(a=>!a.player_id||!S.players.some(p=>p.id===a.player_id)),goneEmails=[...new Set(gone.map(a=>a.email))];
  const onCur=players.filter(p=>cur&&of(p.id).some(a=>a.waiver_version===cur.version)).length;
  el.innerHTML=`<div class="card" id="wv-versions"><div class="card-title">🖋 Waiver versions</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">New sign-ups see the current version. Published wording is never changed — a change is a new version. Only you can see the acceptance records.</div>
    ${vs.length?vs.map(v=>{const isCur=cur&&v.version===cur.version,n=acc.filter(a=>a.waiver_version===v.version).length;return `<div class="wv-ver-row" data-version="${esc(v.version)}"><div><strong>${esc(v.version)}</strong> ${isCur?'<span class="tag tg-green">current</span>':''} <span style="font-size:12px;">${esc(v.title)}</span>
      <div class="wv-sub">SHA-256 ${esc(String(v.sha256).slice(0,16))}… · ${n} acceptance${n===1?'':'s'}${v.note?' · '+esc(v.note):''}</div></div>
      <div class="wv-ver-actions"><button class="btn btn-ghost btn-sm" data-v="${esc(v.version)}" onclick="downloadWaiverWording(this.dataset.v)">⬇ Wording</button>${isCur?'':`<button class="btn btn-warn btn-sm" data-v="${esc(v.version)}" onclick="publishWaiverVersion(this.dataset.v)">Make current</button>`}</div></div>`;}).join(''):'<div class="wv-sub">Loading versions…</div>'}
  </div>
  <div class="card" id="wv-records"><div class="card-title">📄 Acceptance records (${acc.length})</div>
    <div class="flex-between" style="gap:8px;flex-wrap:wrap;margin-bottom:8px;"><span class="wv-sub" id="wv-summary">Current version ${cur?esc(cur.version):'—'} · ${onCur} of ${players.length} registered player${players.length===1?' has':'s have'} accepted it</span>
      <button class="btn btn-ghost btn-sm" id="wv-csv" onclick="downloadWaiverCsv()" ${acc.length?'':'disabled'}>⬇ All acceptances (CSV)</button></div>
    ${players.map(p=>{const list=of(p.id),last=list[list.length-1];return `<div class="wv-row" data-player="${p.id}"><div><strong>${esc(p.name)}</strong>
      <div class="wv-sub">${last?`Version ${esc(last.waiver_version)} · ${esc(fmtWhen(last.accepted_at))}${list.length>1?` · ${list.length} acceptances`:''}${cur&&last.waiver_version!==cur.version?' · <span class="tag tg-yellow">not the current version</span>':''}`:'No acceptance record on file'}</div></div>
      <button class="btn btn-ghost btn-sm" onclick="downloadWaiverRecord(${p.id})">⬇ Record</button></div>`;}).join('')||'<div class="wv-sub">No registered players yet.</div>'}
    ${goneEmails.length?`<div class="lbl" style="margin-top:10px;">People no longer on the player list</div>${goneEmails.map(em=>`<div class="wv-row"><div><strong>${esc(gone.find(a=>a.email===em).participant_name)}</strong><div class="wv-sub">${esc(em)}</div></div><button class="btn btn-ghost btn-sm" data-email="${esc(em)}" onclick="downloadWaiverRecordByEmail(this.dataset.email)">⬇ Record</button></div>`).join('')}`:''}
  </div>`;
}
function tzTime(iso){return new Date(iso).toLocaleString('en-CA',{timeZone:LEAGUE_TZ,year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'});}
function offsetLabel(min){if(min==null)return 'not reported';const a=Math.abs(min);return `UTC${min<0?'−':'+'}${String(Math.floor(a/60)).padStart(2,'0')}:${String(a%60).padStart(2,'0')}`;}
const safeName=x=>String(x||'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'player';
// One person's record: every acceptance, oldest first, each with the exact wording it names. Nothing is inferred.
async function waiverRecordText(rows,who){
  await ensureAllWaiverVersions();
  const V=Object.fromEntries((S.waiverVersions||[]).map(v=>[v.version,v])),line='='.repeat(64),thin='-'.repeat(64);
  let t=`MAPLEWOOD LADDER LEAGUE (DC BADMINTON CLUB) — WAIVER ACCEPTANCE RECORD\nGenerated ${tzTime(new Date().toISOString())} by ${myEmail()||'the organizer'} from the ${SITE_ENV==='production'?'league site':'TEST site'}\n${line}\nPARTICIPANT\nName on file: ${who.name}\nSign-in email: ${who.email||'—'}\nPlayer record: ${who.id?'#'+who.id:'no longer on the player list'}\n`;
  if(!rows.length){
    t+=`${thin}\nNo acceptance record exists for this person.\nIndividual acceptance records (who, when, which wording) began with the waiver versions; a registration made before then was not recorded that way, and no record is created after the fact.\n`;
    if(who.registeredAt)t+=`Registration on file: ${tzTime(who.registeredAt)}\n`;
    return t+line+'\n';
  }
  rows.forEach((a,i)=>{const v=V[a.waiver_version];
    t+=`${thin}\nACCEPTANCE ${i+1} OF ${rows.length}\nAction: ${a.action==='registration'?'accepted on the registration form (ticked the acceptance box and typed a signature)':'accepted an updated version on the site (ticked the acceptance box and typed a signature)'}\nRegistration reference: ${a.registration_ref||'—'}\nWaiver version: ${a.waiver_version}${v?` — ${v.title}`:''}\nWording fingerprint (SHA-256): ${a.waiver_sha256}\nAccepted at: ${a.accepted_at} (UTC) = ${tzTime(a.accepted_at)}\nParticipant's device time zone: ${a.client_timezone||'not reported'} (${offsetLabel(a.client_utc_offset_minutes)})\nAccepted by: ${a.age_declaration==='guardian'?`a parent or legal guardian, for the participant ${a.minor_name}`:'the participant (18 or older)'}\nTyped signature: "${a.typed_signature}"\nName and email at acceptance: ${a.participant_name} <${a.email}>\nPhotos and video: ${a.media_consent===true?'consent given (separate optional box ticked)':a.media_consent===false?'not given (separate optional box left unticked)':'no separate choice was offered with this wording'}\nDevice: ${a.user_agent||'not reported'}\n`;
    if(v)t+=`Wording check: ${v.sha256===a.waiver_sha256?'the fingerprint matches the stored wording below':'WARNING — the stored wording does not match this fingerprint'}\n\nWAIVER WORDING, EXACTLY AS SHOWN (version ${v.version}):\n\n${v.body}\n`;
    else t+=`The wording of version ${a.waiver_version} could not be loaded.\n`;
  });
  return t+line+'\n';
}
function downloadText(name,text,type){const blob=new Blob([text],{type:type||'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
const organizerOnly=()=>{if(!(S_me.organizer&&S_me.verified)){toast('Organizer verification required','warn');return false;}return true;};
async function downloadWaiverRecord(playerId){
  if(!organizerOnly())return;
  const p=S.players.find(x=>x.id===playerId);if(!p)return toast('Player not found','warn');
  try{downloadText(`waiver-record_${safeName(p.name)}_${new Date().toISOString().slice(0,10)}.txt`,await waiverRecordText((S.waiverAcc||[]).filter(a=>a.player_id===playerId),{name:p.name,email:p.email,id:p.id,registeredAt:p.registeredAt}));toast('Waiver record downloaded','success');}
  catch(e){toast('Record not downloaded: '+(e.message||'check the connection'),'error');}
}
async function downloadWaiverRecordByEmail(email){
  if(!organizerOnly())return;
  const rows=(S.waiverAcc||[]).filter(a=>a.email===email&&(!a.player_id||!S.players.some(p=>p.id===a.player_id)));if(!rows.length)return toast('No records for that email','warn');
  try{downloadText(`waiver-record_${safeName(rows[0].participant_name)}_${new Date().toISOString().slice(0,10)}.txt`,await waiverRecordText(rows,{name:rows[0].participant_name,email,id:null}));toast('Waiver record downloaded','success');}
  catch(e){toast('Record not downloaded: '+(e.message||'check the connection'),'error');}
}
// CSV of every acceptance; a cell that a spreadsheet would read as a formula is prefixed with an apostrophe.
function csvCell(v){let x=v==null?'':String(v);if(/^[=+\-@\t\r]/.test(x))x="'"+x;return /[",\n\r]/.test(x)?`"${x.replace(/"/g,'""')}"`:x;}
function downloadWaiverCsv(){
  if(!organizerOnly())return;
  const cols=['id','player_id','participant_name','email','waiver_version','waiver_sha256','accepted_at','client_timezone','client_utc_offset_minutes','action','age_declaration','minor_name','media_consent','registration_ref','typed_signature','user_agent'];
  const rows=(S.waiverAcc||[]).map(a=>[...cols.map(c=>a[c]),tzTime(a.accepted_at)].map(csvCell).join(','));
  downloadText(`waiver-acceptances_${new Date().toISOString().slice(0,10)}.csv`,[[...cols,'accepted_at_league_time'].join(','),...rows].join('\r\n')+'\r\n','text/csv;charset=utf-8');
  toast(`${rows.length} acceptance${rows.length===1?'':'s'} downloaded`,'success');
}
async function downloadWaiverWording(version){
  if(!organizerOnly())return;
  try{await ensureAllWaiverVersions();const v=(S.waiverVersions||[]).find(x=>x.version===version);if(!v)return toast('Version not found','warn');
    downloadText(`waiver-wording_${version}.txt`,`${v.title}\nVersion ${v.version} · SHA-256 ${v.sha256}\n\n${v.body}\n`);toast(`Wording of ${version} downloaded`,'success');}
  catch(e){toast('Not downloaded: '+(e.message||'check the connection'),'error');}
}
async function publishWaiverVersion(version){
  if(!organizerOnly())return;
  if(!confirm(`Make waiver version ${version} the one new sign-ups see?\n\nEvery existing record stays as it is. Registered players will be asked to read and accept this version from their Home page.`))return;
  try{await rpc('publish_waiver_version',{p_version:version});S.waiver=null;await ensureAllWaiverVersions(true);await loadAll();renderAll();renderWaiverAdmin();toast(`Version ${version} is now the current waiver`,'success');}
  catch(e){toast('Not published: '+(e.message||'check the connection'),'error');}
}
"""
a = s.index("function exportWaiver(playerId){")
b = s.index("  toast('Waiver exported!','success');\n}", a) + len("  toast('Waiver exported!','success');\n}")
s = s[:a] + "// Players → 📄 Export: the person's acceptance record (the old export printed a paraphrase of today's terms).\nfunction exportWaiver(playerId){return downloadWaiverRecord(playerId);}\n" + WAIVER_JS + s[b:]

# ── Admin tab, Home card, render hooks, styles ──
sub("""      <button class="ptab" onclick="showSec('admin','a-past',this)">📇 Past Players</button>""",
    """      <button class="ptab" onclick="showSec('admin','a-past',this)">📇 Past Players</button>
      <button class="ptab" id="tab-a-wv" onclick="showSec('admin','a-wv',this);renderWaiverAdmin(true)">🖋 Waivers</button>""")
sub("""    <div id="sec-a-past" class="section"></div>""", """    <div id="sec-a-past" class="section"></div>
    <div id="sec-a-wv" class="section"></div>""")
sub("""  <div id="home-vote"></div>""", """  <div id="home-waiver"></div>
  <div id="home-vote"></div>""")
sub("renderSchedule();renderFeeLines();", "renderSchedule();renderFeeLines();renderWaiverPrompt();")
sub("if(adminUnlocked){renderAdminPlayers();renderRegPlayers();renderPastPlayers();", "if(adminUnlocked){renderAdminPlayers();renderRegPlayers();renderPastPlayers();renderWaiverAdmin();")
sub("""/* ALERTS */""", """/* WAIVER */
[hidden]{display:none!important;}
.wv-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;margin-bottom:8px;}
.waiver-box .wv-title{font-size:15px;}
.wv-list{margin:4px 0 8px 18px;display:grid;gap:2px;}
.wv-loading{color:var(--muted);font-size:13px;padding:8px 0;}
.wv-error{color:var(--red2);font-weight:700;}
.wv-age{border:0;padding:0;margin:10px 0;display:grid;gap:4px;min-width:0;}
.wv-row,.wv-ver-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);}
.wv-sub{font-size:12px;color:var(--muted);}
.wv-ver-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;}

/* ALERTS */""")
f.write_text(s)
print("p38 applied")
