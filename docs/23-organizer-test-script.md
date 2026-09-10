# Organizer test script — run the whole season yourself on TEST

Site: https://chriz93.github.io/dcbadmintonclub-test/  ·  Database: TEST project `wgolevihkvmosajumzvl`
Nothing here touches production. Emails go to the league inbox, never to players, until `ALLOW_REAL_RECIPIENTS=true`.

## 0. Start from a clean sheet (only when you want your own players)

TEST currently holds 33 synthetic players ("TEST Player 01" …) so the reminder job has something to work with.
When you are ready to enter your own 25, run this in the TEST SQL editor. It keeps your organizer account and the
season dates, and clears everything player-shaped:

```sql
begin;
delete from public.rsvp_log; delete from public.rsvps; delete from public.payments;
delete from public.push_subscriptions; delete from public.reminder_log; delete from public.questions;
delete from public.players;
delete from public.app_state where key in ('current_session','completed_sessions','round_snapshots',
  'player_approvals','membership_overrides','pre_session_attendance','reminder_request','reminder_last_run');
commit;
```

Then sign in on the test site and register yourself again (Home offers "Approve my own registration").

## 1. Add the players

Two ways, both fine:

- **Invite** (what real players will use): Admin → Registered → "Invite a player", enter the email, pick Regular or
  Spare. They sign in with that email, register themselves, and you approve them. This exercises the real flow.
- **Add directly** (faster for a solo test): Admin → Players → add a name and a starting court. Use this to fill the
  25 seeding places quickly.

Check as you go: Admin → Registered shows Regular 25/25 and the waitlist offer once a 26th regular registers.

## 2. Seed the courts

Admin → Players: set each player's court, four per court, five on Court 6 when all 25 are in. Home → Courts should
then show 6 courts with the right names.

## 3. Voting week

1. Sign in as a player (use a `+alias@gmail.com` address so it reaches your own inbox) and vote on Home.
2. Decline as one regular. Admin → Standings → RSVP shows the answer; a spare seat opens immediately.
3. Sign in as a spare and press "I'm available". The spare card shows "Seat confirmed (seat 1)".
4. Admin → Tools → "Send vote reminders now". Within about 10 minutes the league inbox receives up to three
   messages tagged `[TEST for <player>]`. Open one and press "I'm coming" to confirm the one-tap link works.
5. After Sunday 10:00 PM the player buttons lock. Change an answer from Admin → Standings → RSVP and confirm the
   change appears on admin Home under "Vote changes" flagged "by admin".

## 4. Match night

1. Admin → Session → Start Session. Players who voted "coming" are seated and marked present; players who declined
   are excused and listed under "Not playing tonight"; confirmed spares are seated automatically.
2. Scores → pick a court → enter 3 games to 21 (Court 6: 5 games to 15) → Save. Repeat for all six courts.
3. The round advances by itself. Play round 2, then End Session.
4. Check every tab: Leaders, Rankings (Elo), Stats, Sessions (arrows), History, Court history, Schedule.

## 5. Money

Admin → Pay: record a payment for a player, see the balance change. The declined regular from step 3 appears under
"Refunds owed" with "Mark refunded". Press it and confirm the ledger entry.

## 6. What to tell me

Anything that looks wrong, plus the session number and the player it happened to. The database keeps an audit trail
(`audit_log`, `rsvp_log`, `reminder_log`), so I can trace any of it afterwards.
