#!/usr/bin/env python3
"""Phase 5 enhancements: payment ledger, waitlist promotion, my-season card (shareable image), Elo in the season PDF,
push notifications opt-in. Data rules live in L08; this patch is the screens."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)

# ── Data: ledger rows (own rows for players, all for the organizer) and the push public key ──────
rep("    S.qaQuestions=((await sbG('questions',", "    S.payments=(await sbG('payments','select=id,player_id,kind,amount,session_number,method,received_on,note&order=received_on.desc,id.desc'))||[];\n    S.qaQuestions=((await sbG('questions',")
rep("const ORGANIZER_ETRANSFER='christygeorge993@gmail.com';", "const ORGANIZER_ETRANSFER='christygeorge993@gmail.com';\nconst VAPID_PUBLIC_KEY='BIiSiPbF4u3zXEy_PWYHGc6he375fIDM-yXoCBzKLIVCWoTc_BXejLMBFIXG_Zrl8178H9Ztfo1eXFvoDefKiNE'; // public half only; the private key lives with the reminder job")

# ── Payments: a ledger instead of a flag ──────────────────────────────────────────────────────────
rep("async function togglePaid(id){const p=S.players.find(x=>x.id===id);if(!p)return;await sbU('players',id,{paid:!p.paid});await loadAll();renderAll();}",
r"""// Ledger helpers. players.paid is derived by the database from these rows (see L08).
function paymentsOf(id){return (S.payments||[]).filter(x=>x.player_id===id);}
function seasonPaid(id){return paymentsOf(id).filter(x=>x.kind==='season'||x.kind==='adjustment').reduce((n,x)=>n+Number(x.amount),0);}
function spareSessionsSeated(id){return S.sessions.filter(s=>Object.values(s.scores||{}).some(sc=>[sc.a1,sc.a2,sc.b1,sc.b2].includes(id))).length;}
function balanceOf(p){
  if(p.membershipType==='spare'){const owed=spareSessionsSeated(p.id)*FEES.spareSession;const paid=paymentsOf(p.id).filter(x=>x.kind==='spare').reduce((n,x)=>n+Number(x.amount),0);return{owed,paid,due:Math.max(0,owed-paid)};}
  const owed=FEES.regularSeason,paid=seasonPaid(p.id);return{owed,paid,due:Math.max(0,owed-paid)};
}
function recordPaymentUI(id){
  const p=S.players.find(x=>x.id===id);if(!p)return;
  const spare=p.membershipType==='spare';
  const sessNo=upcomingSessionNumber();
  openModal(`Record payment — ${esc(p.name)}`,`
    <label class="lbl">Type</label><select class="inp" id="pay-kind" onchange="document.getElementById('pay-amount').value=this.value==='season'?${FEES.regularSeason}:this.value==='spare'?${FEES.spareSession}:this.value==='refund'?${FEES.absenceRefund}:0">
      <option value="season" ${spare?'':'selected'}>Season fee ($${FEES.regularSeason})</option>
      <option value="spare" ${spare?'selected':''}>Spare session fee ($${FEES.spareSession})</option>
      <option value="refund">Refund paid out ($${FEES.absenceRefund} absence notice)</option>
      <option value="adjustment">Adjustment / partial payment</option>
    </select>
    <label class="lbl">Amount (CAD)</label><input class="inp" id="pay-amount" type="number" min="0" step="0.01" value="${spare?FEES.spareSession:FEES.regularSeason}">
    <label class="lbl">Session (spare fee or refund)</label><input class="inp" id="pay-session" type="number" min="1" max="${DATES.length}" value="${sessNo}">
    <label class="lbl">Received on</label><input class="inp" id="pay-date" type="date" value="${new Date().toISOString().slice(0,10)}">
    <label class="lbl">Note</label><input class="inp" id="pay-note" maxlength="300" placeholder="e-transfer reference, who sent it…">
    <button class="btn btn-primary" onclick="recordPayment(${id})">Save payment</button>`);
}
async function recordPayment(id){
  const kind=g('pay-kind'),amount=parseFloat(g('pay-amount')),sess=parseInt(g('pay-session')),date=g('pay-date'),note=g('pay-note').trim();
  if(!(amount>=0))return toast('Enter the amount','warn');
  try{
    await rpc('record_payment',{p_player:id,p_kind:kind,p_amount:amount,p_session:(kind==='spare'||kind==='refund')&&sess?sess:null,p_received_on:date||null,p_note:note});
    closeModal();await loadAll();renderAll();toast('Payment recorded','success');
  }catch(e){toast('Not recorded: '+e.message,'error');}
}
async function deletePayment(pid){
  if(!confirm('Delete this ledger entry?'))return;
  try{await rpc('delete_payment',{p_id:pid});await loadAll();renderAll();toast('Entry deleted','warn');}catch(e){toast('Not deleted: '+e.message,'error');}
}
async function togglePaid(id){recordPaymentUI(id);}""")
rep("""  const regPaid=regulars.filter(p=>p.paid).length;
  const sparePaid=spares.filter(p=>p.paid).length;""",
"""  const regPaid=regulars.filter(p=>p.paid).length;
  const sparePaid=spares.filter(p=>p.paid).length;
  const ledger=S.payments||[];
  const sumKind=k=>ledger.filter(x=>x.kind===k).reduce((n,x)=>n+Number(x.amount),0);
  const collected=sumKind('season')+sumKind('adjustment')+sumKind('spare'),refunded=sumKind('refund');""")
rep("""        <div><div style="font-size:20px;font-weight:800;color:var(--teal2);">$${regPaid*FEES.regularSeason}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Collected</div></div>""",
    """        <div><div style="font-size:20px;font-weight:800;color:var(--teal2);" id="pay-collected">$${collected-refunded}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Net collected</div></div>""")
rep("""  // Regular players first, then spares
  const makeRow=(p)=>{
    const isSpare=p.membershipType==='spare';
    return `<div class="pay-row">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;">${esc(p.name)}${isSpare?'<span class="spare-badge" style="margin-left:6px;">SPARE</span>':''}</div>
        <div style="font-size:11px;color:${p.paid?'var(--green2)':'var(--yellow2)'};">
          ${p.paid?(isSpare?'✅ $20 session fee paid':'✅ Paid $400'):(isSpare?'⏳ $20 session fee pending':'⏳ $400 e-transfer pending')}
        </div>
      </div>
      <button class="btn ${p.paid?'btn-ghost':'btn-success'} btn-sm" onclick="togglePaid(${p.id})">${p.paid?'Undo':'Mark Paid'}</button>
    </div>`;
  };""",
"""  // Regular players first, then spares. Each row shows the ledger balance and the entries behind it.
  const makeRow=(p)=>{
    const isSpare=p.membershipType==='spare';
    const b=balanceOf(p);
    const rows=paymentsOf(p.id);
    const status=isSpare
      ?(b.owed===0?'No spare sessions yet':b.due===0?`✅ ${rows.filter(x=>x.kind==='spare').length} session fee${rows.filter(x=>x.kind==='spare').length===1?'':'s'} paid`:`⏳ $${b.due} owing for ${Math.round(b.due/FEES.spareSession)} session${b.due>FEES.spareSession?'s':''}`)
      :(b.due===0?`✅ Season fee paid ($${b.paid})`:b.paid>0?`⏳ $${b.due} still owing (paid $${b.paid})`:`⏳ $${FEES.regularSeason} e-transfer pending`);
    return `<div class="pay-row" style="flex-wrap:wrap;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;">${esc(p.name)}${isSpare?'<span class="spare-badge" style="margin-left:6px;">SPARE</span>':''}</div>
        <div style="font-size:11px;color:${b.due===0&&b.owed>0?'var(--green2)':'var(--yellow2)'};" class="pay-status">${status}</div>
      </div>
      <button class="btn btn-success btn-sm" onclick="recordPaymentUI(${p.id})">＋ Record</button>
      ${rows.length?`<div style="flex-basis:100%;font-size:11px;color:var(--muted);margin-top:6px;">${rows.map(x=>`<div style="display:flex;justify-content:space-between;padding:2px 0;"><span>${x.received_on} · ${x.kind}${x.session_number?' S'+x.session_number:''}${x.note?' · '+esc(x.note):''}</span><span>${x.kind==='refund'?'−':''}$${Number(x.amount)} <a href="#" onclick="deletePayment(${x.id});return false;" style="color:var(--red2);margin-left:6px;">✕</a></span></div>`).join('')}</div>`:''}
    </div>`;
  };""")

# ── Waitlist: one tap promotes the first in line when a regular place is free ─────────────────────
rep("""  let html=`<div class="card"><div class="card-title">📊 Overview</div>""",
"""  const firstInLine=[...waitlisted].filter(p=>p.approved).sort((a,b)=>String(a.registeredAt).localeCompare(String(b.registeredAt))||a.id-b.id)[0];
  const freePlaces=Math.max(0,REGULAR_CAPACITY-regularCount);
  let html=(firstInLine&&freePlaces>0)?`<div class="card" id="waitlist-offer" style="border-color:var(--green);"><div class="card-title" style="color:var(--green2);">🎟️ ${freePlaces} regular place${freePlaces===1?'':'s'} free</div>
    <div style="font-size:12px;margin-bottom:8px;">${esc(firstInLine.name)} is first on the waitlist (registered ${String(firstInLine.registeredAt).slice(0,10)}). Promoting makes them a regular for the season ($${FEES.regularSeason}).</div>
    <button class="btn btn-success" onclick="promoteWaitlisted(${firstInLine.id})">Promote ${esc(firstInLine.name.split(' ')[0])} to regular</button></div>`:'';
  html+=`<div class="card"><div class="card-title">📊 Overview</div>""")
rep("async function removePlayer(id){", """async function promoteWaitlisted(id){
  const p=S.players.find(x=>x.id===id);if(!p)return;
  const regularCount=S.players.filter(x=>x.membershipType!=='spare'&&!x.waitlisted&&x.approved&&x.sig&&x.sig!=='admin'&&x.id!==id).length;
  if(regularCount>=REGULAR_CAPACITY)return toast('No regular place is free','warn');
  const approvals=await getKV('player_approvals')||{};
  approvals[id]={...(approvals[id]||{}),approved:true,waitlisted:false,membershipType:'regular'};
  await setKV('player_approvals',approvals);
  await loadAll();renderAll();toast(`${p.name} promoted from the waitlist`,'success');
}
async function removePlayer(id){""")

# ── My season: a card for the signed-in player, shareable as an image ─────────────────────────────
rep('  <div id="home-vote"></div>', '  <div id="home-vote"></div>\n  <div id="my-season"></div>')
rep("  // Player of session\n  renderPOS('pos-home');", "  // Player of session\n  renderPOS('pos-home');\n  renderMySeason();")
rep("function renderPOS(elId){", r"""function mySeasonData(p){
  const elo=computeEloRatings()[p.id]||0;
  const played=S.sessions.filter(s=>Object.values(s.scores||{}).some(sc=>[sc.a1,sc.a2,sc.b1,sc.b2].includes(p.id))).length;
  const wr=p.gamesPlayed>0?Math.round(p.seasonWins/p.gamesPlayed*100):0;
  const streak=(computePlayerStreakAndImprovement()[p.id]||{}).streak||0;
  const courts=S.sessions.map(s=>{const fa=sessFinalAssignments(s);for(let c=1;c<=NC;c++)if((fa[c]||[]).includes(p.id))return c;return null;});
  const rank=[...leaderboardPlayers()].map(x=>({id:x.id,r:computeEloRatings()[x.id]||0})).sort((a,b)=>b.r-a.r).findIndex(x=>x.id===p.id)+1;
  return{elo,played,held:S.sessions.length,wr,streak,courts,rank,court:p.currentCourt,w:p.seasonWins,l:p.seasonLosses,g:p.gamesPlayed,bal:balanceOf(p)};
}
function renderMySeason(){
  const el=document.getElementById('my-season');if(!el)return;
  const me=myPlayer();
  if(!me||!me.approved||(me.gamesPlayed===0&&!S.sessions.length)){el.innerHTML='';return;}
  const d=mySeasonData(me);
  const fee=me.membershipType==='spare'?(d.bal.owed?`Spare fees: $${d.bal.paid} paid${d.bal.due?`, $${d.bal.due} owing`:''}`:'Spare fees: none yet'):(d.bal.due===0?'Season fee paid ✅':`Season fee: $${d.bal.due} owing · e-transfer to ${ORGANIZER_ETRANSFER}`);
  el.innerHTML=`<div class="card" id="my-season-card"><div class="card-title">📈 My season</div>
    <div class="sgrid" style="margin-top:0;">
      <div class="sbox"><div class="sv">${d.w}–${d.l}</div><div class="sl">Record · ${d.wr}%</div></div>
      <div class="sbox"><div class="sv">${d.elo}</div><div class="sl">Elo · #${d.rank||'–'} of ${leaderboardPlayers().length}</div></div>
      <div class="sbox"><div class="sv">${d.court?'C'+d.court:'—'}</div><div class="sl">Court now</div></div>
      <div class="sbox"><div class="sv">${d.played}/${d.held}</div><div class="sl">Sessions played</div></div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px;">${d.streak>0?`🔥 ${d.streak}-session winning streak · `:''}${d.courts.length?'Courts: '+d.courts.map(c=>c||'—').join(' → ')+' · ':''}${fee}</div>
    <button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="shareMySeason()">📤 Share as image</button>
  </div>`;
}
async function shareMySeason(){
  const me=myPlayer();if(!me)return;const d=mySeasonData(me);
  const cv=document.createElement('canvas');cv.width=1080;cv.height=1080;const x=cv.getContext('2d');
  const grad=x.createLinearGradient(0,0,0,1080);grad.addColorStop(0,'#182240');grad.addColorStop(1,'#070a12');x.fillStyle=grad;x.fillRect(0,0,1080,1080);
  x.fillStyle='#e9c46a';x.font='bold 64px Inter, system-ui, sans-serif';x.textAlign='center';x.fillText('Maplewood League',540,150);
  x.fillStyle='#8d98ad';x.font='32px Inter, system-ui, sans-serif';x.fillText(`Season ${SEASON_LABEL} · ${d.held} of ${DATES.length} sessions`,540,210);
  x.fillStyle='#f2efe6';x.font='bold 72px Inter, system-ui, sans-serif';x.fillText(me.name,540,330);
  const boxes=[[`${d.w}–${d.l}`,'RECORD'],[`${d.wr}%`,'WIN RATE'],[String(d.elo),`ELO · #${d.rank||'–'}`],[d.court?'Court '+d.court:'—','NOW ON']];
  boxes.forEach(([v,l],i)=>{const bx=90+(i%2)*470,by=420+Math.floor(i/2)*230;x.fillStyle='rgba(255,255,255,0.06)';x.fillRect(bx,by,430,190);x.fillStyle='#e9c46a';x.font='bold 84px Inter, system-ui, sans-serif';x.fillText(v,bx+215,by+105);x.fillStyle='#8d98ad';x.font='28px Inter, system-ui, sans-serif';x.fillText(l,bx+215,by+160);});
  x.fillStyle='#8d98ad';x.font='30px Inter, system-ui, sans-serif';x.fillText(d.courts.length?'Courts: '+d.courts.map(c=>c||'—').join(' → '):'',540,930);
  x.fillText('chriz93.github.io/dcbadmintonclub',540,1010);
  const blob=await new Promise(r=>cv.toBlob(r,'image/png'));
  const file=new File([blob],'my-season.png',{type:'image/png'});
  try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'My season'});return;}}catch(e){}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='my-season.png';document.body.appendChild(a);a.click();a.remove();
}
function renderPOS(elId){""")

# ── Season PDF: court now and Elo in the standings table ──────────────────────────────────────────
rep("""    const cols=[mg,mg+6,mg+60,mg+95,mg+115,mg+135,mg+158];
    ['#','Name','Membership','Wins','Losses','Win%','Best Court'].forEach((h,i)=>doc.text(h,cols[i],y));""",
"""    const cols=[mg,mg+6,mg+52,mg+80,mg+96,mg+112,mg+130,mg+150,mg+166];
    ['#','Name','Type','W','L','Win%','Court','Best','Elo'].forEach((h,i)=>doc.text(h,cols[i],y));
    const eloAll=computeEloRatings();""")
rep("""    const sorted=[...activePlayers()].sort((a,b)=>b.seasonWins-a.seasonWins||(b.gamesPlayed>0?b.seasonWins/b.gamesPlayed:0)-(a.gamesPlayed>0?a.seasonWins/a.gamesPlayed:0));""",
"""    const sorted=[...activePlayers()].sort((a,b)=>(eloAll[b.id]||0)-(eloAll[a.id]||0)||b.seasonWins-a.seasonWins);""")
rep("""      const rowData=[String(i+1),p.name.length>20?p.name.substring(0,19)+'…':p.name,p.membershipType==='spare'?'Spare':'Regular',String(p.seasonWins),String(p.seasonLosses),wr+'%','C'+p.highestCourt];""",
"""      const rowData=[String(i+1),p.name.length>18?p.name.substring(0,17)+'…':p.name,p.membershipType==='spare'?'Spare':'Regular',String(p.seasonWins),String(p.seasonLosses),wr+'%','C'+p.currentCourt,'C'+p.highestCourt,String(eloAll[p.id]||'')];""")

# ── Push notifications: opt-in from the vote card ────────────────────────────────────────────────
rep("""    html += `<label class="chk-row" style="margin-top:12px;margin-bottom:0;"><input type="checkbox" class="email-reminders-toggle" """,
"""    if(pushSupported())html += `<button class="btn btn-ghost btn-sm push-enable" style="margin-top:10px;" onclick="enablePush()">🔔 ${_pushOn?'Notifications on':'Turn on phone notifications'}</button>`;
    html += `<label class="chk-row" style="margin-top:12px;margin-bottom:0;"><input type="checkbox" class="email-reminders-toggle" """)
rep("// One-tap vote links from reminder emails:", r"""// Push notifications: the browser keeps the subscription; the database keeps the endpoint for the reminder job.
let _pushOn=false;
function pushSupported(){return !!(VAPID_PUBLIC_KEY&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window);}
function b64ToBytes(b64){const s=(b64+'='.repeat((4-b64.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(s);return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));}
async function enablePush(){
  try{
    if(!pushSupported())return toast('Notifications are not available in this browser','warn');
    const perm=await Notification.requestPermission();
    if(perm!=='granted')return toast('Notifications stay off (permission not granted)','warn');
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(VAPID_PUBLIC_KEY)});
    await savePushSubscription(sub.toJSON());
    _pushOn=true;renderRSVP();toast('Notifications on for this phone','success');
  }catch(e){toast('Notifications not enabled: '+(e.message||e),'error');}
}
async function savePushSubscription(j){
  await rpc('save_push_subscription',{p_endpoint:j.endpoint,p_p256dh:j.keys&&j.keys.p256dh||'',p_auth:j.keys&&j.keys.auth||'',p_user_agent:navigator.userAgent.slice(0,200)});
}
async function checkPushState(){try{if(!pushSupported())return;const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();_pushOn=!!sub;}catch(e){}}
// One-tap vote links from reminder emails:""")
rep("checkRegistrationStatus();renderAll();startSync();setInterval(renderHome,30000);registerServiceWorker();registrationFirst();applyPendingVote();",
    "checkRegistrationStatus();renderAll();startSync();setInterval(renderHome,30000);registerServiceWorker();registrationFirst();applyPendingVote();checkPushState().then(()=>renderRSVP());")
# ── The court-history heatmap had no tab; it is now reachable ─────────────────────────────────────
rep("""<button class="ptab" onclick="showSec('standings','hist',this)">📅 History</button>""", """<button class="ptab" onclick="showSec('standings','hist',this)">📅 History</button>
      <button class="ptab" onclick="showSec('standings','heat',this)">🔥 Court history</button>""")
p.write_text(s); print("patched")
