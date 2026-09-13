import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fnSource, html } from './load-app.mjs';

const noop=()=>{};
const app=(names,env={})=>new Function(...Object.keys(env),names.map(fnSource).join('\n')+'\nreturn {'+names.join(',')+'}')( ...Object.values(env));
const session=(ids=[1,2,3,4])=>({players:ids.map(id=>({id,name:'Player '+id})),current:{id:101,number:1,cycle:1,assignments:{1:ids},scores:{}}});

test('review · a refused HTTP update never reports the admin note as saved',async()=>{
 const messages=[];
 const a=app(['restWrite','sbU','saveAdminNote'],{sbFetch:async()=>new Response(JSON.stringify({message:'Organizer verification required',code:'42501'}),{status:403}),document:{getElementById:()=>({value:'Retain this draft'})},toast:(...m)=>messages.push(m),loadAll:()=>assert.fail('a failed save must retain its form'),renderAll:noop,closeModal:()=>assert.fail('a failed save must not close the form')});
 await assert.rejects(a.saveAdminNote(1),/Organizer verification required/);
 assert.equal(messages.some(m=>m[1]==='success'),false);
});
test('review · an unavailable state read is not a missing session',async()=>{
 const version={current_session:9},read={current_session:{version:9}};
 const a=app(['getKV'],{_stateVersion:version,_kvRead:read,sbG:async()=>{throw Error('offline');}});
 await assert.rejects(a.getKV('current_session'),/offline/);assert.equal(version.current_session,9);
});
test('review · a failed multi-table load preserves the previous complete state',async()=>{
 const S=session(),before=structuredClone(S);
 const a=app(['loadAll','_loadAllOnce'],{S,_accountEpoch:0,_activeLoads:0,_writeSeq:0,_session:{},S_me:{organizer:true,verified:true},refreshMe:async()=>{},sbG:async()=>[],getKV:async(k)=>{if(k==='completed_sessions')throw Error('unavailable');return null;},console:{error:noop}});
 assert.equal(await a.loadAll(),false);assert.deepEqual(S,before);
});

for(const change of ['round','session','lineup','scores'])test(`review · a score draft cannot be relabelled after a ${change} change`,async()=>{
 const S=session(),messages=[],area={dataset:{}};
 const env={S,document:{getElementById:id=>id==='score-area'?area:{value:'21'}},toast:m=>messages.push(m),renderScoreEntry:noop,_autoAdvancing:false};
 const a=app(['scoreMatchId','scoreBase','scoreDraftCurrent','saveGameScore'],env);
 area.dataset.match=a.scoreMatchId(1);area.dataset.base=a.scoreBase(1);
 if(change==='round')S.current.cycle=2;
 if(change==='session')S.current.id=102;
 if(change==='lineup')S.current.assignments[1]=[4,3,2,1];
 if(change==='scores')S.current.scores.c1_y1_g1={sA:21,sB:12,w:'A'};
 await a.saveGameScore(1,1);assert.match(messages[0],/match changed/);
});

test('review · best-of-three Save All uses corrected form winners',async()=>{
 const S=session([1,2]);S.current.scores={c1_y1_g1:{w:'A'},c1_y1_g2:{w:'B'}};
 const area={dataset:{}},values={si_1_1_a:'21',si_1_1_b:'12',si_1_2_a:'21',si_1_2_b:'10',si_1_3_a:'',si_1_3_b:''};let persisted;
 const a=app(['scoreMatchId','scoreBase','scoreDraftCurrent','buildCombos','courtTarget','validScore','saveScores'],{S,_autoAdvancing:false,_undoEpoch:0,document:{getElementById:id=>id==='score-area'?area:id.startsWith('si_')?{value:values[id]}:null},toast:noop,allCourtsDone:()=>true,persistCourtScores:async(c,cy,p)=>{persisted=p;return true;},renderScoreEntry:noop,renderRoundTracker:noop,renderCourtTally:noop,renderLeaderboard:noop,renderCourts:noop});
 area.dataset.match=a.scoreMatchId(1);area.dataset.base=a.scoreBase(1);
 await a.saveScores(1);assert.deepEqual(Object.keys(persisted),['c1_y1_g1','c1_y1_g2']);assert.equal(persisted.c1_y1_g2.w,'A');
});

test('review · user-controlled summary names remain text in every summary section',()=>{
 let body='';const name='<b>Audit & "test"</b>';
 const a=app(['esc','showSessionSummary'],{NC:6,S:{players:[{id:1,name}]},window:{},openModal:(title,b)=>body=b});
 a.showSessionSummary({number:1,date:'Sep 15',rounds:1,totalScores:1,courts:{1:[{name,wins:1}]},movements:[{cycle:1,up:[name],down:[name]}],birds:{1:{recipients:[{playerId:1,birdsReceived:2}]}},absent:[name]});
 assert.equal(body.includes('<b>Audit'),false);assert.ok(body.includes('&lt;b&gt;Audit'));
});

for(const [date,expected] of [['2026-09-15','2026-09-16T00:00:00.000Z'],['2026-11-03','2026-11-04T01:00:00.000Z'],['2027-03-09','2027-03-10T01:00:00.000Z'],['2027-03-23','2027-03-24T00:00:00.000Z']]){
 test(`review · Toronto session ${date} has one instant on every device`,()=>{
  const a=app(['leagueStart']);const prev=process.env.TZ;
  try{for(const tz of ['UTC','America/Vancouver','Asia/Kolkata','America/Toronto']){process.env.TZ=tz;assert.equal(a.leagueStart(date).toISOString(),expected,tz);}}
  finally{if(prev===undefined)delete process.env.TZ;else process.env.TZ=prev;}
 });
}

test('review · a saved token from another project is ignored without deleting its storage',()=>{
 const SB='https://test-project.supabase.co',AUTH_STORAGE_KEY='dcbc:test-project.supabase.co:session',map=new Map();
 const token=iss=>'header.'+Buffer.from(JSON.stringify({iss})).toString('base64url')+'.signature';
 const production={access_token:token('https://production-project.supabase.co/auth/v1')};map.set('dcbc-session',JSON.stringify(production));map.set(AUTH_STORAGE_KEY,JSON.stringify(production));
 const a=app(['validSessionIssuer','loadSession'],{SB,AUTH_STORAGE_KEY,_session:null,localStorage:{getItem:k=>map.get(k)}});
 assert.equal(a.loadSession(),null);assert.equal(map.get('dcbc-session'),JSON.stringify(production));
 map.set(AUTH_STORAGE_KEY,JSON.stringify({access_token:token(SB+'/auth/v1')}));assert.ok(a.loadSession());
});

function worker(){
 const events={},deleted=[],puts=[],opened=[];const base='https://club.example/dcbadmintonclub-test/sw.js';
 const env={URL,Response,self:{location:{href:base},addEventListener:(n,f)=>events[n]=f,clients:{claim:noop,matchAll:async()=>[],openWindow:async url=>opened.push(url)}},caches:{keys:async()=>['dcbc-prod-v1','dcbc-test-v64','unrelated'],delete:async k=>deleted.push(k),open:async()=>({put:async(...x)=>puts.push(x)}),match:async()=>null},fetch:async()=>new Response('not found',{status:404})};
 vm.runInNewContext(readFileSync(new URL('../../../sw.js',import.meta.url),'utf8'),env);return{events,deleted,puts,opened};
}
test('review · installing TEST preserves production and unrelated origin caches',async()=>{
 const w=worker();let done;w.events.activate({waitUntil:p=>done=p});await done;assert.deepEqual(w.deleted,['dcbc-test-v64']);
});
test('review · the service worker never intercepts database requests or POSTs',()=>{
 const w=worker();for(const [url,method] of [['https://test-project.supabase.co/rest/v1/players','GET'],['https://club.example/dcbadmintonclub-test/','POST']])w.events.fetch({request:{url,method},respondWith:()=>assert.fail('must not intercept')});
});
test('review · failed static responses never replace good offline cache entries',async()=>{
 const w=worker();let done;w.events.fetch({request:{url:'https://club.example/dcbadmintonclub-test/index.html',method:'GET'},respondWith:p=>done=p});assert.equal((await done).status,404);assert.equal(w.puts.length,0);
});
test('review · the delivered HTML has no connection-capable test runner',()=>{
 assert.doesNotMatch(html,/window\.location\.hash==='#run-tests'|window\.sbG=async|_origSetKV/);
 assert.doesNotMatch(html,/<script[^>]+src="https:\/\/cdnjs/);
});

test('review · partial spare payments remain outstanding and cannot pay a different session',()=>{
 const paid={1:8,2:25,3:0};
 const a=app(['balanceOf'],{spareChargeSessions:()=>[1,2,3],paidForSession:(id,n)=>paid[n],FEES:{spareSession:20}});
 assert.deepEqual(a.balanceOf({id:1,membershipType:'spare'}),{owed:60,paid:28,due:32,settled:1,outstanding:2});
});

for(const action of ['', 'coming', 'notcoming'])test(`review · notification ${action||'body'} opens the intended action without an implicit vote`,async()=>{
 const w=worker();let done;
 w.events.notificationclick({action,notification:{close:noop,data:{url:'https://club.example/dcbadmintonclub-test/?s=3&vote=coming'}},waitUntil:p=>done=p});
 await done;const url=new URL(w.opened[0]);assert.equal(url.searchParams.get('s'),'3');assert.equal(url.searchParams.get('vote'),action||null);
});

test('review · a subscription owned by the previous account is not shown as enabled',async()=>{
 const endpoint='https://push.example/fixture';let owned=[];
 const a=app(['checkPushState'],{_accountEpoch:1,_pushOn:false,pushSupported:()=>true,navigator:{serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>({endpoint})}})}},sbG:async()=>owned});
 assert.equal(await a.checkPushState(),false);owned=[{endpoint}];assert.equal(await a.checkPushState(),true);
});

test('review · an account switch during refresh prevents the old request from being sent',async()=>{
 let release;const pending=new Promise(r=>release=r),calls=[];
 const env={_accountEpoch:1,_session:{user:'first'},SB:'https://synthetic.invalid',ensureSession:()=>pending,authHeaders:()=>({}),fetch:(...args)=>{calls.push(args);return new Response('{}');}};
 vm.runInNewContext(fnSource('sbFetch'),env);
 const request=env.sbFetch('/rest/v1/rpc/record_payment',{method:'POST',body:'old-account-payload'});
 env._accountEpoch=2;env._session={user:'second'};release();
 await assert.rejects(request,/Account changed/);assert.equal(calls.length,0);
});
