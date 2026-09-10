# Backup and restore — legacy site

## What is backed up
`legacy/automation/export-backup.mjs` exports every league table (players, app_state, announcements, rsvps, questions,
invitations, app_admins, reminder_log, audit_log) into one JSON file. The weekly workflow `legacy-backup.yml` runs it
every Wednesday morning after play and keeps the file as a GitHub artifact for 90 days. Run it by hand with:

```bash
SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service key> BACKUP_DIR=~/league-backups node legacy/automation/export-backup.mjs
```

The service key never leaves the machine or the Actions runner. Files contain player contact details: keep them in a
private place (the artifact store or an encrypted folder), never in the repository.

## Restore drill (do this once on TEST before cutover, then every season)
1. Export TEST (command above). Note the row counts printed.
2. In the TEST SQL editor, damage something deliberately, e.g. `update public.players set season_wins=0 where id=1;`
3. Restore the single table from the file: in the SQL editor paste the rows back with
   `insert into public.players (…) values (…) on conflict (id) do update set …` — the helper
   `node legacy/automation/restore-backup.mjs <file> players` prints exactly that statement for one table
   (it never connects to the database itself; you paste and run it, so nothing is restored by accident).
4. Re-run `legacy/migrations/verify.sql` and open the site: standings must match the backup.

## Full restore (disaster)
1. Create a fresh Supabase project (Free plan is enough) and run `legacy/migrations/PROD_2026-27.sql`.
2. Restore tables in this order: players, app_state, announcements, invitations, rsvps, questions, reminder_log.
3. Point the site at the new project (`legacy/scripts/build-production.py --key … --url …`), have the organizer sign
   in once, run `P00_organizer.sql`, then `verify.sql`.
4. Sequences: after inserting rows with explicit ids run
   `select setval(pg_get_serial_sequence('public.players','id'), (select max(id) from public.players));` for each table.
