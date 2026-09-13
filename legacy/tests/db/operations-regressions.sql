\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2","email":"db.organizer@example.invalid"}',true);
do $$
declare p bigint=(select id from dbt.ids where name='P1');v int;cfg jsonb;fn record;n int;w public.waiver_versions;ret bigint;
begin
 perform public.delete_state('current_session');
 perform public.checkpoint('Archive player');perform public.archive_player(p);
 if not (select archived_at is not null from public.players where id=p) then raise exception 'FAIL archive';end if;
 perform public.undo_last();
 if not (select archived_at is null and approved from public.players where id=p) then raise exception 'FAIL archive undo';end if;
 raise notice 'PASS review: archiving and undo preserve identity, waiver evidence and active visibility';
 select value::jsonb into cfg from public.app_state where key='season_config';
 cfg=cfg||jsonb_build_object('season','2031-check','registration_start','2031-01-01','approved_dates','["2031-09-09"]'::jsonb);
 begin perform public.start_new_season('null-end',cfg-'end_time_local');raise exception 'FAIL missing end time';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.start_new_season('overlap',cfg||jsonb_build_object('cancelled_dates',cfg->'approved_dates'));raise exception 'FAIL contradictory calendar';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.start_new_season('bad-money',jsonb_set(cfg,'{fees,spare_session}','20.001'));raise exception 'FAIL fractional cents';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.cancel_league_session(1,0,'Test reason',null,0);raise exception 'FAIL null cancellation plan';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.cancel_league_session(1,0,'Test reason','refund',null);raise exception 'FAIL null refund';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.add_league_player('Null membership',0,null);raise exception 'FAIL null membership';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 raise notice 'PASS review: incomplete operation parameters are rejected before writes';
 -- Exhaust the last regular place, then prove the second promotion rolls back both representations.
 update public.players set approved=false where membership_type='regular' and id<>p;
 for n in 1..25 loop perform public.add_league_player('Capacity fixture '||n,0,'regular');end loop;
 select id into p from public.players where not approved and membership_type='regular' limit 1;
 select coalesce(version,0) into v from public.app_state where key='player_approvals';
 begin perform public.set_state('player_approvals',jsonb_build_object(p::text,jsonb_build_object('approved',true,'waitlisted',false))::text,coalesce(v,0));raise exception 'FAIL capacity overflow';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 if (select approved from public.players where id=p) then raise exception 'FAIL failed capacity change leaked';end if;
 raise notice 'PASS review: last-place capacity is enforced by the shared server transaction';
 -- A legacy roster may already exceed the new cap. Safe waitlisting must still work, without increasing that excess.
 insert into public.players(name,email,sig,waiver_signed,paid,current_court,highest_court,membership_type,approved,waitlisted) values('Legacy excess regular','','admin',false,false,0,0,'regular',true,false);
 select coalesce(version,0) into v from public.app_state where key='player_approvals';
 v=public.set_state('player_approvals',jsonb_build_object(p::text,jsonb_build_object('approved',true,'waitlisted',true))::text,coalesce(v,0));
 if not (select approved and waitlisted from public.players where id=p) then raise exception 'FAIL legacy excess prevents waitlisting';end if;
 begin perform public.set_state('player_approvals',jsonb_build_object(p::text,jsonb_build_object('approved',true,'waitlisted',false))::text,v);raise exception 'FAIL worsened legacy excess';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 raise notice 'PASS review: legacy excess capacity permits safe waitlisting but cannot grow';
 -- Each organizer-only entry point must remain unavailable to anonymous callers and reject aal1.
 for fn in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('start_league_session','finalize_session','cancel_league_session','settle_cancellation','start_new_season','save_league_snapshot','restore_league_snapshot','archive_player','add_league_player') loop
  if has_function_privilege('anon',fn.oid,'EXECUTE') then raise exception 'FAIL anonymous execute: %',fn.proname;end if;
 end loop;
 perform set_config('request.jwt.claims','{"aal":"aal1","email":"db.organizer@example.invalid"}',true);
 begin perform public.save_league_snapshot('unauthorized');raise exception 'FAIL no MFA snapshot';exception when insufficient_privilege then null;end;
 begin perform public.start_league_session('{}');raise exception 'FAIL no MFA start';exception when insufficient_privilege then null;end;
 begin perform public.cancel_league_session(1,0,'unauthorized','shuttles',0);raise exception 'FAIL no MFA cancel';exception when insufficient_privilege then null;end;
 begin perform public.archive_player(p);raise exception 'FAIL no MFA archive';exception when insufficient_privilege then null;end;
 raise notice 'PASS review: anonymous grants and organizer MFA enforced on new operation APIs';
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2","email":"db.organizer@example.invalid"}',true);
do $$
declare p bigint=(select id from dbt.ids where name='P1');w public.waiver_versions;ret bigint;n int;
begin
 perform public.delete_state('current_session');perform public.archive_player(p);
 delete from public.invitations where email='db.p1@example.invalid';
 select * into w from public.waiver_versions where is_current;
 perform set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',true);
 perform set_config('request.jwt.claims','{"aal":"aal1","email":"db.p1@example.invalid"}',true);
 begin perform public.register_me('Dee Bee One','613-555-0100','Kin','','Dee Bee One','regular','will_pay',w.version,w.sha256,'Dee Bee One','America/Toronto',-240,'adult','',false,'regression');raise exception 'FAIL archived user registered without invitation';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
 perform set_config('request.jwt.claims','{"aal":"aal2","email":"db.organizer@example.invalid"}',true);
 insert into public.invitations(email,membership_type) values('db.p1@example.invalid','regular');
 perform set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',true);
 perform set_config('request.jwt.claims','{"aal":"aal1","email":"db.p1@example.invalid"}',true);
 select count(*) into n from public.waiver_acceptances where player_id=p;
 ret=public.register_me('Dee Bee One','613-555-0100','Kin','','Dee Bee One','regular','will_pay',w.version,w.sha256,'Dee Bee One','America/Toronto',-240,'adult','',false,'regression');
 if ret<>p or not exists(select 1 from public.players where id=p and archived_at is null and not approved) then raise exception 'FAIL returning identity or approval';end if;
 if (select count(*) from public.waiver_acceptances where player_id=p)<>n+1 then raise exception 'FAIL returning waiver evidence';end if;
 raise notice 'PASS review: archived members require invitation and sign their own new acceptance on the original identity';
end $$;
rollback;
