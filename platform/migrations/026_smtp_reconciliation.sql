begin;
-- Durable pre-send marker prevents re-sending a Gmail message after worker crash.
alter table club_app.notification_deliveries add column smtp_started_at timestamptz;
create function club_app.begin_smtp_delivery(delivery_id uuid,attempt int) returns void language plpgsql security definer set search_path='' as $$ begin
 update club_app.notification_deliveries set smtp_started_at=now() where id=delivery_id and attempts=attempt and status='processing' and channel='email' and lease_until>now() and smtp_started_at is null;
 if not found then raise exception 'Stale or already started SMTP delivery';end if;
end $$;
alter function club_app.claim_delivery_batch(int,text[]) rename to claim_delivery_batch_provider_impl;
revoke all on function club_app.claim_delivery_batch_provider_impl(int,text[]) from public,anon,authenticated,service_role;
create function club_app.claim_delivery_batch(batch_size int,channels text[]) returns setof club_app.notification_deliveries language plpgsql security definer set search_path='' as $$ begin
 update club_app.notification_deliveries set status='failed',lease_until=null,failure_reason='SMTP outcome unknown; reconcile before any manual resend' where status='processing' and lease_until<now() and smtp_started_at is not null;
 return query select * from club_app.claim_delivery_batch_provider_impl(batch_size,channels);
end $$;
alter function club_app.finish_delivery(uuid,int,text,text) rename to finish_delivery_provider_impl;
revoke all on function club_app.finish_delivery_provider_impl(uuid,int,text,text) from public,anon,authenticated,service_role;
create function club_app.finish_delivery(delivery_id uuid,attempt int,outcome text,provider_id text default null) returns void language plpgsql security definer set search_path='' as $$ begin
 perform 1 from club_app.notification_deliveries where id=delivery_id for update;
 if outcome='pending' and exists(select 1 from club_app.notification_deliveries where id=delivery_id and smtp_started_at is not null) then outcome='failed';end if;
 perform club_app.finish_delivery_provider_impl(delivery_id,attempt,outcome,provider_id);
end $$;
revoke all on function club_app.begin_smtp_delivery(uuid,int),club_app.claim_delivery_batch(int,text[]),club_app.finish_delivery(uuid,int,text,text) from public,anon,authenticated,service_role;
grant execute on function club_app.begin_smtp_delivery(uuid,int),club_app.claim_delivery_batch(int,text[]),club_app.finish_delivery(uuid,int,text,text) to service_role;
commit;
