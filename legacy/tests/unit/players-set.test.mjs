// p68: players are set before the session starts (no Call In during a session), and the organizer's own vote locks at
// the deadline like every regular's. Browser cases: tabs/call-in.spec.ts, tabs/organizer-vote.spec.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnSource } from './load-app.mjs';

const app=(names,env)=>new Function(...Object.keys(env),names.map(fnSource).join('\n')+'\nreturn {'+names.join(',')+'}')(...Object.values(env));
const start=Date.parse('2026-09-15T20:00:00-04:00'),H=3600e3;
const lock=(now,unlocked)=>app(['voteLocked'],{FD:[new Date(start)],FEES:{voteDeadlineHours:46},upcomingSessionNumber:()=>1,isSpareMember:p=>p.membershipType==='spare',adminUnlocked:unlocked,Date:{now:()=>now}}).voteLocked;
const regular={id:1,membershipType:'regular'},spare={id:2,membershipType:'spare'};

test('p68 · a regular\'s vote locks 46 hours before play (voteLocked)',()=>{
 assert.equal(lock(start-47*H,false)(regular),false);
 assert.equal(lock(start-45*H,false)(regular),true);
});
test('p68 · the organizer\'s own answer locks too, while they are unlocked',()=>{
 assert.equal(lock(start-47*H,true)(regular),false,'open before the deadline');
 assert.equal(lock(start-45*H,true)(regular),true,'locked after it (they change answers in Standings → RSVP)');
});
test('p68 · spares are never locked by the regulars\' deadline; no player, no lock',()=>{
 assert.equal(lock(start-3*H,true)(spare),false);
 assert.equal(lock(start-3*H,false)(null),false);
});
test('p68 · during a session Call In is refused and changes nothing (callInSpare)',async()=>{
 const said=[];
 const a=app(['callInSpare'],{S:{current:{number:1}},toast:(m,k)=>said.push([m,k]),changePlayerAttendance:()=>assert.fail('nobody is seated during a session'),rpc:()=>assert.fail('nothing is saved'),sbU:()=>assert.fail('nothing is saved')});
 await a.callInSpare(7);
 assert.deepEqual(said,[['Players are set before the session starts — Call In is only used before the session.','warn']]);
});
test('p68 · during a session the pool shows who plays tonight and offers no Call In (poolAction)',()=>{
 const a=app(['poolAction','courtLock'],{S:{current:{number:1,assignments:{4:[1]}}},courtOfPlayer:id=>id===1?4:0,esc:x=>x,isSpareMember:()=>true,spareCourtUpcoming:()=>0});
 const seated=a.poolAction({id:1,name:'Ann'}),off=a.poolAction({id:2,name:'Bo'});
 assert.match(seated,/✓ Playing · Court 4/);assert.doesNotMatch(seated,/callInSpare/);
 assert.match(off,/Not playing tonight/);assert.match(off,/Bo is not playing tonight: players are set before the session starts/);assert.doesNotMatch(off,/callInSpare/);
});
test('p68 · during a session the Players tag does not seat a player without a court tonight (togglePlayerPresence)',async()=>{
 const said=[];
 const a=app(['togglePlayerPresence'],{S:{players:[{id:5,name:'Cy Dee'}],current:{attendance:{}}},courtOfPlayer:()=>0,changePlayerAttendance:()=>assert.fail('not seated'),toast:(m,k)=>said.push([m,k]),renderAdminPlayers:()=>{},setKV:async()=>assert.fail('nothing is saved'),loadAll:async()=>true,renderAll:()=>{},_attSaveTimer:null});
 await a.togglePlayerPresence(5);
 assert.deepEqual(said,[['Players are set before the session starts — only players in tonight’s lineup can be marked.','warn']]);
});
