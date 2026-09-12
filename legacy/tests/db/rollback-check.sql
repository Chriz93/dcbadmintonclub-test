-- After ROLLBACK_2026-09-12.sql (run by run.sh on the rehearsal database): the previous site's registration call works
-- again, it records no waiver acceptance (the previous site has no waiver step), every acceptance recorded before the
-- rollback is kept, and the marker says the functions were rolled back. Synthetic data only.
insert into auth.users(id,email,email_confirmed_at) values('b0000000-0000-0000-0000-0000000000f1','rollback.check@example.invalid',now());
insert into public.invitations(email,membership_type) values('rollback.check@example.invalid','regular');
begin;
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-0000000000f1',true), set_config('request.jwt.claims','{"role":"authenticated"}',true);
set local role authenticated;
do $$ declare pid bigint; begin
 pid=public.register_me('Rolly Back','613','EC','','sig','regular','will_pay');
 if pid is null then raise exception 'the previous site could not register'; end if;
end $$;
reset role;
commit;
do $$ begin
 if (select count(*) from public.players where email='rollback.check@example.invalid' and declared_payment='will_pay')<>1 then raise exception 'the registration was not saved'; end if;
 if exists(select 1 from public.waiver_acceptances a join public.players p on p.id=a.player_id where p.email='rollback.check@example.invalid') then raise exception 'the previous site recorded an acceptance'; end if;
 if (select count(*) from public.waiver_acceptances)<>(select n from dbt.rb_before) then raise exception 'waiver records changed during the rollback'; end if;
 if (select schema_version from public.environment) not like '% (L19/L20 functions rolled back)' then raise exception 'the marker should say the functions were rolled back'; end if;
 if (select name from public.environment)<>'test' then raise exception 'the marker name changed'; end if;
end $$;
select 'ROLLBACK CHECK PASS' as result;
