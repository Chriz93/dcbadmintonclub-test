import test from 'node:test';
import assert from 'node:assert/strict';
import {SEASON,sessionStart,upcomingSession,planReminders,composeEmail,composePush,run} from './remind.mjs';
const env={SUPABASE_URL:'https://database.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',SITE_URL:'https://site.invalid/test/',GMAIL_USER:'league@example.invalid',TEST_INBOX:'inbox@example.invalid',DELIVERY_MODE:'live'};
const target={player_id:9,name:'Test Spare',email:'spare@example.invalid',membership_type:'spare',kind:'spare-reserved',open_seats:0};
const now=sessionStart(SEASON.approved_dates[0]).getTime()-50*3600000;
const baseDB=()=>({state:async()=>null,targets:async()=>[],reservations:async()=>[],logged:async()=>new Set(),claim:async()=>true,unclaim:async()=>{},setState:async()=>{}});
test('review · preparing courts days early does not suppress vote reminders',()=>{
 assert.equal(upcomingSession([], {number:1,scores:{}},now).started,false);
 assert.equal(upcomingSession([], {number:1,scores:{one:{}}},now).started,true);
});
test('review · cancelled dates are skipped by session identity even with gaps',()=>{
 assert.equal(upcomingSession([{number:2,status:'cancelled'}],null,now).number,1);
 assert.equal(upcomingSession([{number:1},{number:2,status:'cancelled'}],null,now).number,3);
});
test('review · opening a notification never contains a vote command',()=>{
 for(const stage of ['vote-1','spare','spare-reserved','spare-confirmed']){
  const p=composePush({...target,stage},1,env.SITE_URL);assert.equal(new URL(p.url).searchParams.has('vote'),false);assert.equal(new URL(p.url).searchParams.get('s'),'1');
 }
});
test('review · reserved and confirmed notices each send once, independently of the initial invitation',()=>{
 const ts=[target,{...target,player_id:10,kind:'spare-confirmed'}];
 assert.deepEqual(planReminders(ts,25,new Set(['9:spare'])).map(t=>t.stage),['spare-reserved','spare-confirmed']);
 assert.equal(planReminders(ts,25,new Set(['9:spare-reserved','10:spare-confirmed'])).length,0);
 assert.equal(planReminders(ts,-1,new Set()).length,0);
});
test('review · reservation wording asks for payment, confirmation says payment is verified',()=>{
 assert.match(composeEmail({...target,stage:'spare-reserved'},1,env.SITE_URL,env.GMAIL_USER).text,/reserved.*E-transfer \$20/s);
 const m=composeEmail({...target,stage:'spare-confirmed'},1,env.SITE_URL,env.GMAIL_USER);assert.match(m.text,/payment is verified/);assert.doesNotMatch(m.text,/vote=coming/);
});
for(const mode of ['prepared','started','complete'])test(`review · vote digest is independent of ${mode} session reminder eligibility`,async()=>{
 const db=baseDB(),sent=[],writes=[];
 db.state=async k=>k==='current_session'?(mode==='complete'?null:{number:1,scores:mode==='started'?{one:{}}:{}}):k==='completed_sessions'?(mode==='complete'?SEASON.approved_dates.map((_,i)=>({number:i+1})):[]):null;
 db.voteLog=async()=>[{id:3,session_number:1,player_id:1,new_response:'coming',changed_at:new Date(now).toISOString()}];db.playersBrief=async()=>[{id:1,name:'Test Member'}];db.setState=async(k,v)=>writes.push([k,v]);
 const out=await run(env,{db,now,log:()=>{},transport:{sendMail:async m=>sent.push(m)}});
 assert.equal(out.digest,1);assert.match(sent[0].subject,/Admin/);assert.ok(writes.some(([k,v])=>k==='vote_digest_last_id'&&v===3));
});
test('review · failed reservation delivery releases its claim and succeeds on retry without duplicating',async()=>{
 const db=baseDB(),claims=new Set(),sent=[];let fail=true;
 db.reservations=async()=>[target];db.logged=async()=>new Set(claims);db.claim=async(s,p,k)=>{const key=p+':'+k;if(claims.has(key))return false;claims.add(key);return true;};db.unclaim=async(s,p,k)=>claims.delete(p+':'+k);
 const deps={db,now,log:()=>{},transport:{sendMail:async m=>{if(fail)throw Error('offline');sent.push(m);}}};
 assert.equal((await run(env,deps)).sent,0);assert.equal(claims.size,0);fail=false;
 assert.equal((await run(env,deps)).sent,1);assert.equal((await run(env,deps)).sent,0);assert.equal(sent.length,1);assert.equal(sent[0].to,env.TEST_INBOX);
});
test('review · next-season dates and fees drive worker output regardless of host timezone',async()=>{
 const season={...SEASON,season:'2027-28',approved_dates:['2027-11-09'],fees:{...SEASON.fees,spare_session:25}};
 const old=process.env.TZ;try{for(const tz of ['UTC','America/Vancouver','Asia/Kolkata']){process.env.TZ=tz;assert.equal(sessionStart(season.approved_dates[0],season).toISOString(),'2027-11-10T01:00:00.000Z');}}finally{process.env.TZ=old;}
 const db=baseDB(),sent=[];db.state=async k=>k==='season_config'?season:null;db.reservations=async()=>[target];
 await run(env,{db,now:sessionStart(season.approved_dates[0],season).getTime()-25*3600000,log:()=>{},transport:{sendMail:async m=>sent.push(m)}});
 assert.match(sent[0].text,/\$25/);assert.match(sent[0].subject,/November 9/);
});

test('review · custom deadlines drive reminders and dates, not hard-coded Sundays',()=>{
 const cfg={...SEASON,approved_dates:['2027-11-10'],start_time_local:'18:30',time_zone:'America/Vancouver',fees:{...SEASON.fees,absence_notice_hours:48,vote_deadline_hours:24}};
 const voter={...target,kind:'vote'};
 assert.equal(planReminders([voter],25,new Set(),cfg)[0].stage,'vote-3');
 assert.equal(planReminders([voter],23,new Set(),cfg).length,0);
 const mail=composeEmail({...target,stage:'vote-3'},1,env.SITE_URL,env.GMAIL_USER,cfg);
 assert.match(mail.text,/Tuesday.*6:30/s);assert.doesNotMatch(mail.text,/Sunday|8:00/);
 for(const stage of ['spare-reserved','spare-confirmed']){const push=composePush({...target,stage},1,env.SITE_URL,cfg);assert.equal(push.actions,undefined);assert.match(push.title,/Spare seat/);}
});
