// p63: saves on their way, a reload that overlaps them, one record's saves in order, and Save while a round advances
// (legacy/patches/p63_saves_during_slow_replies.py). The browser cases are in tabs/slow-network.spec.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnSource } from './load-app.mjs';

// The named page functions with the given globals; get() reads the globals back, set.<name>(v) changes one.
const app=(names,env={})=>{const k=Object.keys(env);return new Function(...k,names.map(fnSource).join('\n')+`\nreturn {${names.join(',')},get:()=>({${k.join(',')}}),set:{${k.map(x=>`${x}:v=>{${x}=v;}`).join(',')}}};`)(...Object.values(env));};
const READ_RPCS=new Set(['admin_status','list_league_snapshots']);
const reply=(body='1')=>async()=>new Response(body,{status:200});
const tick=()=>new Promise(r=>setImmediate(r));

test('p63 · _writing counts a save while it is on its way, and after it fails',async()=>{
 const a=app(['_writing'],{_writeStarts:0,_writesOpen:0});
 let release;const p=a._writing(()=>new Promise(r=>release=r));
 assert.deepEqual(a.get(),{_writeStarts:1,_writesOpen:1});
 release('ok');assert.equal(await p,'ok');assert.deepEqual(a.get(),{_writeStarts:1,_writesOpen:0});
 await assert.rejects(a._writing(async()=>{throw Error('refused');}),/refused/);assert.deepEqual(a.get(),{_writeStarts:2,_writesOpen:0});
});
test('p63 · rpc counts saves and not reads (_rpc)',async()=>{
 const a=app(['_writing','rpc','_rpc'],{READ_RPCS,_writeSeq:0,_writeStarts:0,_writesOpen:0,sbFetch:reply()});
 await a.rpc('admin_status');await a.rpc('list_league_snapshots');
 assert.deepEqual([a.get()._writeStarts,a.get()._writeSeq],[0,0]);
 assert.equal(await a.rpc('set_state',{k:'x'}),1);
 assert.deepEqual([a.get()._writeStarts,a.get()._writesOpen,a.get()._writeSeq],[1,0,1]);
});
test('p63 · table saves are counted (restWrite/_restWrite, sbUps/_sbUps)',async()=>{
 const a=app(['_writing','restWrite','_restWrite','sbUps','_sbUps'],{_writeSeq:0,_writeStarts:0,_writesOpen:0,sbFetch:reply('[]'),toast:()=>{}});
 await a.restWrite('/rest/v1/players?id=eq.1','PATCH',{name:'A'});await a.sbUps('rsvps',{player_id:1});
 assert.deepEqual([a.get()._writeStarts,a.get()._writesOpen,a.get()._writeSeq],[2,0,2]);
});
test('p63 · two saves of one record go one after another, each with the version the previous one returned (setKV/_setKV)',async()=>{
 const sent=[];let release;
 const rpc=async(fn,args)=>{sent.push([args.k,args.expected]);if(sent.length===1)await new Promise(r=>release=r);return args.expected+1;};
 const a=app(['setKV','_setKV'],{rpc,_stateVersion:{s:4,t:9},_kvQueue:{},toast:()=>{},loadAll:async()=>true,renderAll:()=>{},console});
 const one=a.setKV('s',{n:1}),two=a.setKV('s',{n:2}),other=a.setKV('t',{n:3});
 await tick();
 assert.deepEqual(sent,[['s',4],['t',9]],'the second save of s waits for the first reply; another record does not wait');
 release();await Promise.all([one,two,other]);
 assert.deepEqual(sent,[['s',4],['t',9],['s',5]]);
 assert.deepEqual(a.get()._stateVersion,{s:6,t:10});assert.deepEqual(a.get()._kvQueue,{},'nothing left queued');
});
test('p63 · a refused save does not hold up the next one',async()=>{
 const sent=[];
 const rpc=async(fn,args)=>{sent.push(args.expected);if(sent.length===1)throw Object.assign(Error('Save refused'),{code:'500'});return args.expected+1;};
 const a=app(['setKV','_setKV'],{rpc,_stateVersion:{s:1},_kvQueue:{},toast:()=>{},loadAll:async()=>true,renderAll:()=>{},console:{error:()=>{}}});
 const one=a.setKV('s',1),two=a.setKV('s',2);
 await assert.rejects(one,/Save refused/);await two;
 assert.deepEqual(sent,[1,1]);assert.equal(a.get()._stateVersion.s,2);
});
test('p63 · a reload overlapped by a save is repeated after the save finishes (loadAll/_savesSettled)',async()=>{
 let a;const seen=[];
 a=app(['loadAll','_savesSettled'],{_loadAllOnce:async()=>{seen.push(a.get()._writesOpen);return seen.length===1?'stale':true;},_writesOpen:1,_attSaveTimer:null});
 setTimeout(()=>a.set._writesOpen(0),120);
 const t=Date.now();assert.equal(await a.loadAll(),true);
 assert.deepEqual(seen,[1,0],'the second try starts after the save finished');assert.ok(Date.now()-t>=100);
});
test('p63 · a reload waits for the attendance save that is waiting its second',async()=>{
 let a;const seen=[];
 a=app(['loadAll','_savesSettled'],{_loadAllOnce:async()=>{seen.push(a.get()._attSaveTimer);return seen.length===1?'stale':true;},_writesOpen:0,_attSaveTimer:17});
 setTimeout(()=>a.set._attSaveTimer(null),120);
 assert.equal(await a.loadAll(),true);assert.deepEqual(seen,[17,null]);
});
test('p63 · three overlapped tries at most, then the reload is dropped',async()=>{
 let n=0;const a=app(['loadAll','_savesSettled'],{_loadAllOnce:async()=>{n++;return 'stale';},_writesOpen:0,_attSaveTimer:null});
 assert.equal(await a.loadAll(),'stale');assert.equal(n,3);
});
test('p63 · Save is off while a round advances and back on after (advanceLock/endAdvance)',()=>{
 let renders=0;
 const a=app(['advanceLock','endAdvance'],{_autoAdvancing:true,document:{getElementById:()=>({value:'3'}),querySelectorAll:()=>[]},renderScoreEntry:()=>renders++});
 assert.equal(a.advanceLock(),' disabled data-adv title="The round is advancing. Save when this button turns on."');
 a.endAdvance();assert.equal(a.get()._autoAdvancing,false);assert.equal(renders,1,'the chosen court is drawn again');assert.equal(a.advanceLock(),'');
 const b=app(['advanceLock','endAdvance'],{_autoAdvancing:true,document:{getElementById:()=>({value:''}),querySelectorAll:()=>[]},renderScoreEntry:()=>renders++});
 b.endAdvance();assert.equal(b.get()._autoAdvancing,false);assert.equal(renders,1,'no court chosen: nothing to draw');
});
test('p63 · the Players tag attendance save counts as waiting until its timer fires (togglePlayerPresence)',async()=>{
 const saved=[];
 const a=app(['togglePlayerPresence'],{S:{players:[{id:7,name:'Ann Bee'}],current:null,preAttendance:{}},renderAdminPlayers:()=>{},setKV:async(k,v)=>{saved.push([k,{...v}]);},_attSaveTimer:null,courtOfPlayer:()=>0,changePlayerAttendance:()=>assert.fail('no session'),toast:()=>{},loadAll:async()=>true,renderAll:()=>{}});
 await a.togglePlayerPresence(7);
 assert.ok(a.get()._attSaveTimer,'waiting');assert.deepEqual(saved,[]);
 await new Promise(r=>setTimeout(r,1150));
 assert.equal(a.get()._attSaveTimer,null);assert.deepEqual(saved,[['pre_session_attendance',{7:'present'}]]);
});
test('p63 · End Session answers with the reason while the last round is being saved (endSession)',async()=>{
 const said=[];
 const a=app(['endSession'],{S:{current:{completed:true,cycle:2,scores:{}}},_autoAdvancing:true,toast:m=>said.push(m),confirm:()=>assert.fail('nothing is asked'),MAX_ROUNDS_PER_SESSION:2,allCourtsDone:()=>true});
 await a.endSession();
 assert.deepEqual(said,['The last round is still being saved — end the session when the button turns on.']);
});
test('p63 · the buttons turn on in place, even when the redraw keeps the old form (a background refresh is drawing)',()=>{
 const attrs=()=>{const a={disabled:'','data-adv':'',title:'The round is advancing. Save when this button turns on.'};return a;};
 const buttons=[0,1,2].map(()=>{const at=attrs();return {disabled:true,at,removeAttribute:k=>{delete at[k];}};});
 let asked='';
 const a=app(['endAdvance'],{_autoAdvancing:true,document:{getElementById:()=>({value:'2'}),querySelectorAll:q=>{asked=q;return buttons;}},renderScoreEntry:()=>{}});
 a.endAdvance();
 assert.equal(asked,'#score-area [data-adv]');
 assert.deepEqual(buttons.map(b=>[b.disabled,Object.keys(b.at).sort()]),[[false,['disabled']],[false,['disabled']],[false,['disabled']]]);
});
