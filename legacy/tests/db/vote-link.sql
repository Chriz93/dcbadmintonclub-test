-- L31: answering from the email. Every case rolls back.
\set ON_ERROR_STOP on
begin;
create temp table t(name text, got text, want text);

-- A player and two sessions: one voting-open, one past its deadline.
insert into public.players(name,email,approved,waitlisted,membership_type,current_court)
 values ('Test Player','t9001@example.invalid',true,false,'regular',3);
select id as pid from public.players where email='t9001@example.invalid' \gset
insert into public.season_dates(session_number,play_on,start_at,cancelled) values
 (901, current_date + 7, now() + interval '7 days', false),   -- wide open
 (902, current_date + 1, now() + interval '20 hours', false), -- inside the 46h deadline
 (903, current_date + 7, now() + interval '7 days', true)     -- cancelled
 on conflict(session_number) do nothing;

-- 1. a link is issued, and asking twice gives the SAME link (Friday and Sunday carry one door, not two)
select public.issue_vote_link(:pid,901) as tok \gset
insert into t values('one token per player per session',
  (select case when public.issue_vote_link(:pid,901)=:'tok' then 'same' else 'different' end),'same');
insert into t values('token is 64 hex characters', (select case when :'tok' ~ '^[0-9a-f]{64}$' then 'yes' else 'no' end),'yes');

-- 2. reading it tells the page what to show, and does NOT record anything
insert into t values('info reads ok', (select public.vote_link_info(:'tok')->>'status'),'ok');
insert into t values('info names the player', (select public.vote_link_info(:'tok')->>'first_name'),'Test');
insert into t values('reading is not answering',
  (select coalesce((select response from public.rsvps where session_number=901 and player_id=:pid),'(none)')),'(none)');

-- 3. answering works, and lands in rsvps like any other vote
insert into t values('apply returns ok', (select public.apply_vote_link(:'tok','coming')->>'status'),'ok');
insert into t values('the answer is recorded',
  (select response from public.rsvps where session_number=901 and player_id=:pid),'coming');
insert into t values('the change is in the audit log',
  (select count(*)::text from public.rsvp_log where session_number=901 and player_id=:pid),'1');

-- 4. they can change their mind with the same link
insert into t values('changing the answer', (select public.apply_vote_link(:'tok','notcoming')->>'status'),'ok');
insert into t values('the new answer is recorded',
  (select response from public.rsvps where session_number=901 and player_id=:pid),'notcoming');
insert into t values('every use is counted',
  (select use_count::text from public.vote_links where token=:'tok'),'2');

-- 5. the token answers that one question and nothing else
insert into t values('an unknown token', (select public.apply_vote_link('deadbeef','coming')->>'status'),'unknown');
insert into t values('a response it was not asked for', (select public.apply_vote_link(:'tok','maybe')->>'status'),'bad_response');

-- 6. a cancelled session gets no link at all
-- (psql leaves :variables alone inside dollar quotes, so the attempt goes through a temp function.)
create function pg_temp.try_issue(pl bigint, se int) returns text language plpgsql as $f$
begin perform public.issue_vote_link(pl,se); return 'issued'; exception when others then return 'refused'; end $f$;
insert into t values('a cancelled session has no link', pg_temp.try_issue(:pid,903),'refused');

-- 7. past the deadline the link stops working, and says so rather than failing silently
select public.issue_vote_link(:pid,902) as late \gset
insert into t values('a link inside the deadline is already dead',
  (select public.vote_link_info(:'late')->>'status'),'closed');
insert into t values('and it will not answer', (select public.apply_vote_link(:'late','coming')->>'status'),'closed');
insert into t values('so the dead link wrote nothing',
  (select coalesce((select response from public.rsvps where session_number=902 and player_id=:pid),'(none)')),'(none)');

-- 8. set_rsvp still refuses to answer for somebody else (the rules moved, they did not loosen)
do $$ begin perform public.set_rsvp(901,9001,'coming','');
  insert into t values('set_rsvp still needs a signed-in player','allowed','refused');
exception when others then insert into t values('set_rsvp still needs a signed-in player','refused','refused'); end $$;

-- 9. rsvp_write is where the rules now live, so it is checked directly as well as through both callers.
insert into t values('rsvp_write is closed to every site role',
  (select case when has_function_privilege('authenticated','public.rsvp_write(int,bigint,text,text,boolean)','execute')
            or has_function_privilege('anon','public.rsvp_write(int,bigint,text,text,boolean)','execute')
          then 'reachable' else 'closed' end),'closed');
create function pg_temp.try_write(se int, pl bigint, resp text, enforce boolean) returns text language plpgsql as $f$
begin perform public.rsvp_write(se,pl,resp,'',enforce); return 'wrote'; exception when others then return 'refused'; end $f$;
-- session 902 is inside the 46-hour deadline: held to it, a regular is refused...
insert into t values('rsvp_write keeps the deadline when it is told to',
  pg_temp.try_write(902,:pid,'coming',true),'refused');
-- ...and not held to it, the same write goes through. That is the only difference between a player answering and the
-- organizer answering for them, and it is now in one place instead of two.
insert into t values('rsvp_write can be told to ignore it, which is the organizer path',
  pg_temp.try_write(902,:pid,'coming',false),'wrote');
insert into t values('and that is what landed in rsvps',
  (select response from public.rsvps where session_number=902 and player_id=:pid),'coming');
insert into t values('rsvp_write still refuses a response nobody recognises',
  pg_temp.try_write(901,:pid,'perhaps',false),'refused');

-- 10. nobody but the worker can reach any of it
insert into t values('anon cannot mint a link',
  (select case when has_function_privilege('anon','public.issue_vote_link(bigint,int)','execute') then 'can' else 'cannot' end),'cannot');
insert into t values('a signed-in player cannot answer for others',
  (select case when has_function_privilege('authenticated','public.apply_vote_link(text,text)','execute') then 'can' else 'cannot' end),'cannot');
insert into t values('the token table is not readable through the API',
  (select case when has_table_privilege('authenticated','public.vote_links','select') then 'can' else 'cannot' end),'cannot');

-- Fail the run, not just the page: run.sh gates on ON_ERROR_STOP.
do $$ declare bad int; detail text; begin
 select count(*), coalesce(string_agg(name||' (got '||got||', want '||want||')', '; '), '')
   into bad, detail from t where got is distinct from want;
 if bad > 0 then raise exception 'vote links: % case(s) failed — %', bad, detail; end if;
end $$;
select 'PASS review: vote links — '||count(*)||' cases (token issue, read, answer, change, expiry, grants)' as result from t;
rollback;
