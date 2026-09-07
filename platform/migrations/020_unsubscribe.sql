begin;
create function club_app.unsubscribe_channel(c uuid,u uuid,channel_name text) returns void language plpgsql security definer set search_path='' as $$ begin
 if channel_name not in ('email','sms') or channel_name is null then raise exception 'Invalid channel';end if;
 update club_app.notification_preferences set enabled=false where club_id=c and user_id=u and channel=channel_name;
 update club_app.notification_deliveries set status='suppressed',lease_until=null where club_id=c and user_id=u and channel=channel_name and status='pending';
end $$;
revoke all on function club_app.unsubscribe_channel(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function club_app.unsubscribe_channel(uuid,uuid,text) to service_role;
commit;
