-- EMERGENCY ROLLBACK ONLY. Re-opens the legacy anonymous access so the OLD index.html works again.
-- This restores the insecure pre-2026 state (anyone with the anon key can read and write). Use together with
-- redeploying the previous index.html from the production repository's git history, then plan the retry.
-- The new tables, columns and functions are left in place; they are harmless to the old site.
begin;
grant usage on schema public to anon;
grant all on public.players,public.announcements,public.app_state to anon;
grant usage,select on all sequences in schema public to anon;
do $$ declare t text; begin foreach t in array array['players','announcements','app_state'] loop
 execute format('drop policy if exists "anon read %1$s" on public.%1$I',t);
 execute format('drop policy if exists "anon write %1$s" on public.%1$I',t);
 execute format('drop policy if exists "anon update %1$s" on public.%1$I',t);
 execute format('drop policy if exists "anon delete %1$s" on public.%1$I',t);
 execute format('create policy "anon read %1$s" on public.%1$I for select to anon using(true)',t);
 execute format('create policy "anon write %1$s" on public.%1$I for insert to anon with check(true)',t);
 execute format('create policy "anon update %1$s" on public.%1$I for update to anon using(true) with check(true)',t);
 execute format('create policy "anon delete %1$s" on public.%1$I for delete to anon using(true)',t);
end loop; end $$;
commit;
