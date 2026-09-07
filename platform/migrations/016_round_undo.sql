begin;
create function club_app.undo_round_restart(c uuid,event_id bigint,expected_revision int,reason text) returns void language plpgsql security definer set search_path='' as $$
declare event club_app.audit_events; sess club_app.sessions; s uuid; first_round int; entry jsonb;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select * into event from club_app.audit_events where club_id=c and id=event_id and action='round.restarted';if not found then raise exception 'Restart snapshot unavailable';end if;
 s=(event.after_value->>'session')::uuid;first_round=(event.after_value->>'from_round')::int;
 select * into sess from club_app.sessions where club_id=c and id=s for update;
 if not found or sess.status<>'active' or expected_revision is null or sess.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Restore reason required';end if;
 if exists(select 1 from club_app.audit_events where club_id=c and action='round.restart_undone' and after_value->>'restart_event'=event_id::text) then raise exception 'Restart already restored';end if;
 if exists(select 1 from club_app.matches where club_id=c and session_id=s and round>=first_round) or exists(select 1 from club_app.assignments where club_id=c and session_id=s and round>=first_round) then raise exception 'New rounds exist; restore would overwrite work';end if;
 perform 1 from club_app.seasons where id=sess.season_id for update;
 insert into club_app.assignments select * from jsonb_populate_recordset(null::club_app.assignments,event.before_value->'assignments');
 for entry in select value from jsonb_array_elements(event.before_value->'matches') loop
 insert into club_app.matches select * from jsonb_populate_record(null::club_app.matches,entry||jsonb_build_object('revision',(entry->>'revision')::int+1));
 end loop;
 update club_app.sessions set status=event.before_value->'session'->>'status',revision=revision+1 where id=s;
 if first_round=1 then update club_app.no_show_penalties set status='applied',revision=revision+1 where club_id=c and applied_session=s and status='pending';end if;
 perform club_app.rebuild_results(c,sess.season_id);
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'round.restart_undone',to_jsonb(sess),jsonb_build_object('session',s,'restart_event',event_id,'reason',reason));
end $$;
revoke all on function club_app.undo_round_restart(uuid,bigint,int,text) from public,anon;
grant execute on function club_app.undo_round_restart(uuid,bigint,int,text) to authenticated;
commit;
