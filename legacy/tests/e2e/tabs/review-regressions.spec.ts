import { test, expect } from '@playwright/test';
import { openAs, closeCtx, load, type Ctx } from './harness';
import { genLeague } from './gen';

let ctx: Ctx;
test.beforeEach(async({browser})=>{ctx=await openAs(browser);});
test.afterEach(async()=>closeCtx(ctx));
const league=(seed=91000)=>genLeague(seed,{regulars:8,spares:1,pending:1,sessions:0,live:'r1-partial',absentRate:0,declineRate:0,benchRate:0});
const stored=()=>JSON.parse(ctx.state.state.current_session?.value||'null');
const openAdmin=async(section:string)=>ctx.page.evaluate(s=>{nav('admin');showSec('admin',s);},section);

test('Review · approval persists through reload in canonical records',async()=>{
 const L=league();L.current=null;await load(ctx,L);const p=L.players.find(p=>!p.approved)!;
 await ctx.page.evaluate(id=>approvePlayer(id),p.id);
 expect(ctx.state.players.find(x=>x.id===p.id)?.approved).toBe(true);
 await ctx.page.evaluate(async()=>{await loadAll();renderAll();});
 expect(await ctx.page.evaluate(id=>S.players.find(p=>p.id===id)?.approved,p.id)).toBe(true);
});

test('Review · stale score draft cannot cross a session identity change',async()=>{
 const L=league();L.current!.scores={};await load(ctx,L);await ctx.page.evaluate(()=>nav('scores'));await ctx.page.locator('#sc-sel').selectOption('1');
 await ctx.page.locator('#si_1_1_a').fill('21');await ctx.page.locator('#si_1_1_b').fill('12');
 const newer={...stored(),id:'replacement-session',number:2,scores:{}};ctx.state.state.current_session={value:JSON.stringify(newer),version:1};
 await ctx.page.evaluate(async()=>{await loadAll();}); // Save is attempted before rendering a replacement form.
 await ctx.page.locator('#sbtn_1').click();
 await expect(ctx.page.locator('#_t')).toContainText(/changed|stale|refresh/i);
 expect(stored().scores).toEqual({});
});

test('Review · unsaved scores survive unrelated refresh but not a remote correction',async()=>{
 const L=league();L.current!.scores={};await load(ctx,L);await ctx.page.evaluate(()=>nav('scores'));await ctx.page.locator('#sc-sel').selectOption('1');
 await ctx.page.locator('#si_1_1_a').fill('21');await ctx.page.locator('#si_1_1_b').fill('9');
 const input=await ctx.page.locator('#si_1_1_b').elementHandle();
 await ctx.page.evaluate(async()=>{_isSyncing=true;try{await loadAll();renderAll();}finally{_isSyncing=false;}});
 await expect(ctx.page.locator('#si_1_1_b')).toHaveValue('9');
 expect(await input!.evaluate(e=>e.isConnected),'the input itself survives an unrelated refresh').toBe(true);
 await expect(ctx.page.locator('#si_1_1_b')).toBeFocused();
 const other=stored(),[a,b,c,d]=other.assignments[1];other.scores.c1_y1_g1={a1:a,a2:b,b1:c,b2:d,sA:21,sB:15,w:'A'};ctx.state.state.current_session={value:JSON.stringify(other),version:2};
 await ctx.page.evaluate(async()=>{_isSyncing=true;try{await loadAll();renderAll();}finally{_isSyncing=false;}});
 await expect(ctx.page.locator('#si_1_1_b')).toHaveValue('15');
});

test('Review · shuttle form value and focus survive two background refreshes',async()=>{
 await load(ctx,league());await openAdmin('a-sess');
 const field=ctx.page.locator('#birds_1');await field.fill('3');
 for(let i=0;i<2;i++)await ctx.page.evaluate(async()=>{_isSyncing=true;try{await loadAll();renderAll();}finally{_isSyncing=false;}});
 await expect(field).toHaveValue('3');await expect(field).toBeFocused();
});

test('Review · failed player save retains the note and never announces success',async()=>{
 await load(ctx,league());const id=ctx.state.players[0].id;await ctx.page.evaluate(id=>openAdminNote(id),id);await ctx.page.locator('#admin-note-text').fill('Keep this draft');
 await ctx.page.route('**/rest/v1/players?*',async route=>{if(route.request().method()==='PATCH')return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Organizer verification required',code:'42501'})});await route.fallback();});
 await ctx.page.locator('#modal.open').getByRole('button',{name:'💾 Save Note'}).click();
 await expect(ctx.page.locator('#_t')).toContainText('Organizer verification required');await expect(ctx.page.locator('#admin-note-text')).toHaveValue('Keep this draft');
 expect(ctx.state.players[0].admin_note).not.toBe('Keep this draft');
});

test('Review · snapshot restores roster, ledger and RSVP with original IDs',async()=>{
 const L=league();L.current=null;await load(ctx,L);
 const key=await ctx.page.evaluate(()=>rpc('save_league_snapshot',{p_label:'Before changes'}));
 const original=structuredClone(ctx.state.players),payments=structuredClone(ctx.state.payments),votes=structuredClone(ctx.state.rsvps);
 ctx.state.players[0].name='Changed after snapshot';ctx.state.payments=[];ctx.state.rsvps=[];
 await ctx.page.evaluate(key=>restoreSnapshot(key),key);
 expect(ctx.state.players).toEqual(original);expect(ctx.state.payments).toEqual(payments);expect(ctx.state.rsvps).toEqual(votes);
 expect(Object.keys(ctx.state.state).filter(k=>k.startsWith('snapshot_'))).toHaveLength(2);
 await expect(ctx.page.locator('#_t')).toHaveText('League snapshot restored');
});

test('Review · school cancellation advances the schedule and refunds a paid spare only once',async()=>{
 const L=league();L.current!.scores={};const spare=L.players.find(p=>p.membership_type==='spare')!;
 L.payments.push({id:990,player_id:spare.id,kind:'spare',amount:12,session_number:1,method:'e-transfer',received_on:'2026-09-10',note:'Partial fee'});
 await load(ctx,L);await ctx.page.evaluate(()=>cancelSession());await ctx.page.locator('#cancel-reason').fill('School closure');
 await ctx.page.locator('#modal.open').getByRole('button',{name:/Record cancellation/}).click();
 await expect(ctx.page.locator('#_t')).toContainText('Cancellation recorded');expect(stored()).toBeNull();
 expect(await ctx.page.evaluate(()=>upcomingSessionNumber())).toBe(2);
 await openAdmin('a-pay');await expect(ctx.page.locator('#pay-list')).toContainText('2 shuttlecocks');
 await ctx.page.evaluate(async id=>{await settleCancellation(1,id);await settleCancellation(1,id);},spare.id);
 expect(ctx.state.payments.filter(x=>x.kind==='refund'&&x.player_id===spare.id)).toHaveLength(1);
 expect(ctx.state.payments.find(x=>x.kind==='refund'&&x.player_id===spare.id)?.amount).toBe(12);
});

test('Review · untrusted names render literally across organizer and summary screens',async()=>{
 const L=league();const name='<img src=x onerror="window.reviewInjected=1"> & O\'Neil';L.players[0].name=name;await load(ctx,L);
 await openAdmin('a-pl');await expect(ctx.page.locator('#a-pl-list')).toContainText(name);
 await ctx.page.evaluate(name=>showSessionSummary({number:1,date:'Sep 15',rounds:1,totalScores:0,courts:{1:[{name,wins:0}]},movements:[{cycle:1,up:[name],down:[name]}],birds:{},absent:[name]}),name);
 await expect(ctx.page.locator('#modal.open')).toContainText(name);await expect(ctx.page.locator('#modal.open img')).toHaveCount(0);
 expect(await ctx.page.evaluate(()=>window.reviewInjected)).toBeUndefined();
});

test('Review · all organizer navigation is reachable at 320 pixels and modal focus survives rerender',async()=>{
 await load(ctx,league());await ctx.page.setViewportSize({width:320,height:760});
 for(const id of ['home','register','courts','scores','standings','schedule','admin']){const b=ctx.page.locator('#bnav-'+id);const box=await b.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(320);await b.click();await expect(ctx.page.locator('#page-'+id)).toHaveClass(/active/);}
 await openAdmin('a-pl');await ctx.page.locator('[onclick^="openAdminNote("]').first().click();
 await ctx.page.evaluate(()=>renderAll());await ctx.page.keyboard.press('Escape');
 expect(await ctx.page.evaluate(()=>document.activeElement!==document.body&&!!document.activeElement?.getClientRects().length)).toBe(true);
 const row=ctx.page.locator('.admin-player-row').first();await row.scrollIntoViewIfNeeded();
 expect((await row.locator('.admin-player-details').boundingBox())!.width).toBeGreaterThan(180);
 for(const control of await row.locator('button,select,.tag[onclick]').all()){
  const box=(await control.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);expect(box.height).toBeGreaterThanOrEqual(44);
 }
 await ctx.page.screenshot({path:'test-results/review-mobile-320.png'});
});

test('Review · sign-out works before a toast exists and wipes private drafts while keeping another application’s storage',async()=>{
 await load(ctx,league());await ctx.page.evaluate(()=>{localStorage.setItem('unrelated-app-session','preserve-me');regData={name:'Private previous member',medical:'Private medical note'};S.payments=[{note:'Private receipt'}];document.getElementById('a-pl-list').textContent='Previous organizer medical notes';openModal('Private modal','Previous organizer receipt');});
 await ctx.page.evaluate(()=>{document.getElementById('_t')?.remove();return signOut();});
 expect(await ctx.page.evaluate(()=>({name:regData.name,payments:S.payments,players:S.players.length,other:localStorage.getItem('unrelated-app-session')}))).toEqual({name:undefined,payments:undefined,players:0,other:'preserve-me'});
 await expect(ctx.page.locator('#invite-gate')).toBeVisible();
 expect(await ctx.page.locator('body').textContent()).not.toContain('Previous organizer');
});

test('Review · a payment retry after a lost response records exactly one receipt',async()=>{
 const L=league();L.current=null;await load(ctx,L);const id=L.players[0].id,before=ctx.state.payments.length;
 await ctx.page.evaluate(id=>recordPaymentUI(id),id);await ctx.page.locator('#pay-amount').fill('12.50');
 let first=true;const requests:string[]=[];
 await ctx.page.route('**/rest/v1/rpc/record_payment',async route=>{
  const a=route.request().postDataJSON();requests.push(a.p_request);
  if(first){first=false;ctx.state.payments.push({id:99999,request_id:a.p_request,player_id:a.p_player,kind:a.p_kind,amount:a.p_amount,session_number:a.p_session,received_on:a.p_received_on,note:a.p_note,method:'e-transfer'});return route.abort('failed');}
  await route.fallback();
 });
 await ctx.page.locator('#save-payment').click();await expect(ctx.page.locator('#_t')).toContainText('Retry uses the same request');
 await expect(ctx.page.locator('#pay-amount')).toHaveValue('12.50');
 await ctx.page.evaluate(id=>Promise.all([recordPayment(id),recordPayment(id)]),id);
 await expect(ctx.page.locator('#_t')).toHaveText('Payment recorded');expect(requests).toHaveLength(2);expect(requests[0]).toBe(requests[1]);expect(ctx.state.payments).toHaveLength(before+1);
});

test('Review · a delayed private refresh cannot repopulate state after sign-out',async()=>{
 await load(ctx,league());let release!:()=>void,served!:()=>void;
 const taken=new Promise<void>(r=>served=r),until=new Promise<void>(r=>release=r);ctx.state.holdRead={key:'current_session',until,served};
 const refresh=ctx.page.evaluate(()=>loadAll());await taken;await ctx.page.evaluate(()=>signOut());release();await refresh;
 expect(await ctx.page.evaluate(()=>({players:S.players,current:S.current,payments:S.payments}))).toEqual({players:[],current:null,payments:undefined});
});

test('Review · declining court synchronization sends no player updates',async()=>{
 const L=genLeague(92004,{regulars:8,spares:0,sessions:1,live:'none',absentRate:0});
 L.players.forEach(p=>p.current_court=6);await load(ctx,L);const before=structuredClone(ctx.state.players);
 ctx.page.removeAllListeners('dialog');ctx.page.on('dialog',d=>d.dismiss());
 let writes=0;await ctx.page.route('**/rest/v1/players?*',async route=>{if(route.request().method()==='PATCH')writes++;await route.fallback();});
 await ctx.page.evaluate(()=>syncCourtsFromLastSession());
 expect(writes).toBe(0);expect(ctx.state.players).toEqual(before);
});

test('Review · Back restores both the score page and its selected court',async()=>{
 await load(ctx,league());await ctx.page.evaluate(()=>nav('home'));await ctx.page.evaluate(()=>nav('scores'));
 await ctx.page.locator('#sc-sel').selectOption('1');await ctx.page.locator('#sc-sel').selectOption('2');await ctx.page.evaluate(()=>nav('schedule'));
 await ctx.page.goBack();await expect(ctx.page.locator('#page-scores')).toHaveClass(/active/);await expect(ctx.page.locator('#sc-sel')).toHaveValue('2');
 await ctx.page.goBack();await expect(ctx.page.locator('#sc-sel')).toHaveValue('1');await expect(ctx.page).toHaveURL(/#scores\?court=1$/);
});

test('Review · retry sync recovers a refused read without emptying the league',async()=>{
 await load(ctx,league());const ids=ctx.state.players.map(p=>p.id);
 const fail=async route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"Temporarily unavailable"}'});
 await ctx.page.route('**/rest/v1/app_state?*',fail);await ctx.page.evaluate(()=>retrySync());
 await expect(ctx.page.locator('#slbl')).toHaveText('Sync failed');await expect(ctx.page.locator('#sync-retry')).toBeVisible();
 expect(await ctx.page.evaluate(()=>S.players.map(p=>p.id))).toEqual(ids);
 await ctx.page.unroute('**/rest/v1/app_state?*',fail);await ctx.page.locator('#sync-retry').click();
 await expect(ctx.page.locator('#slbl')).toHaveText('Synced');await expect(ctx.page.locator('#sync-retry')).toBeHidden();
});

for(const expired of ['request','refresh'])test(`Review · expired ${expired} clears private state and organizer access`,async()=>{
 await load(ctx,league());await ctx.page.evaluate(()=>regData={medical:'Private draft'});
 const path=expired==='request'?'**/rest/v1/players?*':'**/auth/v1/token?grant_type=refresh_token';
 await ctx.page.route(path,route=>route.fulfill({status:expired==='request'?401:400,contentType:'application/json',body:'{"message":"Session expired"}'}));
 if(expired==='refresh')await ctx.page.evaluate(()=>_session.expires_at=0);
 await ctx.page.evaluate(async()=>{try{await sbG('players');}catch(e){}});
 expect(await ctx.page.evaluate(()=>({players:S.players,medical:regData.medical,admin:adminUnlocked,session:_session}))).toEqual({players:[],medical:undefined,admin:false,session:null});
 await expect(ctx.page.locator('#invite-gate')).toBeVisible();
});
