// p65: a button always answers. "Use current fees and session time" (Admin → Tools) fills the next-season fields and
// says so; with the season settings not loaded it says that instead of doing nothing. The browser side is the button
// and keyboard census (tabs/buttons.spec.ts, tabs/keys.spec.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnSource } from './load-app.mjs';

const app=(names,env={})=>new Function(...Object.keys(env),names.map(fnSource).join('\n')+'\nreturn {'+names.join(',')+'}')(...Object.values(env));
const config={start_time_local:'20:00',end_time_local:'22:00',time_zone:'America/Toronto',regular_capacity:26,fees:{regular_season:400,spare_session:20,absence_refund:10,absence_notice_hours:24,vote_deadline_hours:48,spare_ask_hours:24}};

test('p65 · Use current fees and session time fills the next-season fields and says so (prepareNextSeason)',()=>{
 const fields={},said=[];
 const a=app(['prepareNextSeason'],{S:{seasonConfig:config},document:{getElementById:id=>(fields[id]??={value:''})},toast:(m,k)=>said.push([m,k])});
 a.prepareNextSeason();
 assert.deepEqual(Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])),{'new-season-start-time':'20:00','new-season-end-time':'22:00','new-season-zone':'America/Toronto','new-season-capacity':26,'new-season-regular':400,'new-season-spare':20,'new-season-refund':10,'new-season-notice':24,'new-season-deadline':48,'new-season-ask':24});
 assert.deepEqual(said,[['Filled in with the current fees and session time — change what differs for next season','info']]);
});
test('p65 · without the season settings it says so instead of doing nothing',()=>{
 const said=[];
 const a=app(['prepareNextSeason'],{S:{seasonConfig:null},document:{getElementById:()=>assert.fail('no field is touched')},toast:(m,k)=>said.push([m,k])});
 a.prepareNextSeason();
 assert.deepEqual(said,[['The current season settings are not loaded yet — refresh and try again','warn']]);
});
