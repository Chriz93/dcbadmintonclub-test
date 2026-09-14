// p69: spares fill the courts up to 24 players (the organizer, 14 September: "we have 27 regular players, if say 4 of
// them voted no, we will take in one spare"). Seats = 24 minus the regulars coming, counted as the starting courts seat
// them; decided when the regulars' vote closes (46 hours before play); then available spares take them in the order
// they replied, and a seat is confirmed once paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnSource } from './load-app.mjs';

const start=Date.parse('2026-09-15T20:00:00-04:00'),H=3600e3;
const regular=(id,court=1)=>({id,approved:true,waitlisted:false,membershipType:'regular',currentCourt:court});
const spare=id=>({id,approved:true,waitlisted:false,membershipType:'spare',currentCourt:0});
/** spareSeats() for a league: `regs` regulars on the ladder, `declines` of them "not coming", spares 101.. replying in order. */
function seatsFor({regs=27,declines=0,spares=[],paid=[],now=start-30*H,current=null,pre={},extra=[]}){
 const players=[...Array.from({length:regs},(_,i)=>regular(i+1,1+(i%6))),...extra,...spares.map(spare)];
 const rsvpRows=[...Array.from({length:declines},(_,i)=>({player_id:i+1,response:'notcoming',updated_at:`2026-09-10T0${i%9}:00:00Z`})),
  ...spares.map((id,k)=>({player_id:id,response:'coming',updated_at:`2026-09-11T1${k}:00:00Z`}))];
 const S={players,rsvpRows,current,preAttendance:pre};
 const isRegularMember=p=>!!p&&p.approved&&!p.waitlisted&&p.membershipType!=='spare',isSpareMember=p=>!!p&&p.approved&&p.membershipType==='spare';
 const FixedDate=class extends Date{static now(){return now;}};   // the page's clock, fixed for the case
 const env={S,S_me:{organizer:true,player_id:null},isRegularMember,isSpareMember,upcomingSessionNumber:()=>1,FD:[new Date(start)],FEES:{voteDeadlineHours:46,spareSession:20},paidForSession:id=>paid.includes(id)?20:0,Date:FixedDate};
 return new Function(...Object.keys(env),fnSource('spareSeats')+'\nreturn spareSeats')(...Object.values(env))();
}

test('p69 · 27 regulars, 4 not coming: one spare seat (the organizer\'s example) (spareSeats)',()=>{
 const s=seatsFor({regs:27,declines:4,spares:[101,102],paid:[101,102]});
 assert.deepEqual([s.coming,s.seats,s.decided],[23,1,true]);
 assert.deepEqual(s.claims.map(c=>[c.id,c.reserved,c.confirmed]),[[101,true,true],[102,false,false]],'the first to reply takes the seat');
 assert.equal(s.open,0);
});
test('p69 · 24 or more regulars coming: no spare seats',()=>{
 for(const [regs,declines] of [[27,3],[27,0],[24,0]]){const s=seatsFor({regs,declines,spares:[101],paid:[101]});assert.equal(s.seats,0);assert.equal(s.claims[0].reserved,false);}
});
test('p69 · fewer regulars: the seats fill the courts up to 24',()=>{
 const s=seatsFor({regs:20,declines:2,spares:[101,102,103,104,105,106,107],paid:[101,102,103,104,105,106]});
 assert.deepEqual([s.coming,s.seats],[18,6]);
 assert.deepEqual(s.claims.filter(c=>c.reserved).map(c=>c.id),[101,102,103,104,105,106]);
 assert.deepEqual(s.claims.filter(c=>c.confirmed).map(c=>c.id),[101,102,103,104,105,106]);
 assert.equal(s.claims.find(c=>c.id===107).reserved,false,'the seventh is on standby');
});
test('p69 · a reserved seat is confirmed only once paid',()=>{
 const s=seatsFor({regs:22,declines:0,spares:[101,102],paid:[102]});
 assert.deepEqual(s.claims.map(c=>[c.id,c.reserved,c.confirmed]),[[101,true,false],[102,true,true]]);
});
test('p69 · before the regulars\' vote closes no seat is reserved',()=>{
 const s=seatsFor({regs:20,declines:2,spares:[101,102],paid:[101,102],now:start-47*H});
 assert.deepEqual([s.decided,s.seats,s.open],[false,6,4]);
 assert.ok(s.claims.every(c=>!c.reserved&&!c.confirmed));
 assert.equal(seatsFor({regs:20,spares:[101],paid:[101],now:start-45.9*H}).claims[0].reserved,true,'reserved once it closes');
});
test('p69 · during a session the seats are decided',()=>{
 assert.equal(seatsFor({regs:20,spares:[101],now:start-100*H,current:{number:1}}).decided,true);
});
test('p69 · counted as the starting courts seat them: no ladder court, absent or present before the night',()=>{
 const noCourt=[regular(50,0),regular(51,0)];
 assert.equal(seatsFor({regs:22,extra:noCourt}).coming,22,'regulars without a ladder court are not seated, so not counted');
 assert.equal(seatsFor({regs:22,pre:{3:'absent'}}).coming,21,'marked absent before the night');
 assert.equal(seatsFor({regs:22,declines:2,pre:{1:'present'}}).coming,21,'marked present despite a "not coming" vote');
});
