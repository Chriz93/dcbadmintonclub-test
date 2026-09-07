-- Synthetic staging seed. Provenance is the user-supplied date transcription, NOT the PDF.
-- Run only on a disposable test project after migrations. No real members are seeded.
begin;
insert into club_app.clubs(id,slug,name,settings) values('10000000-0000-0000-0000-000000000001','dc-badminton','DC Badminton Club','{"timezone":"America/Toronto","contact":null,"feesPendingConfirmation":true}') on conflict do nothing;
insert into club_app.venues(id,club_id,name,address,rooms) values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Maplewood Secondary School','700 Cope Drive, Stittsville, Ontario','127C & 127D') on conflict do nothing;
insert into club_app.seasons(id,club_id,name,regular_capacity,spare_capacity,waitlist_capacity) values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026–2027',25,0,0) on conflict do nothing;
insert into club_app.permit_imports(id,club_id,permit_number,source_name,sha256,preview) values('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-07-21-0001','User-provided transcription (PDF unverified)','0eee99dd9e73ff31d5b0749a9275f2d8f40d05dd02e2a6a2d21000ef54043750','{"expectedActive":28,"expectedHours":56,"requiresPDFConfirmation":true}') on conflict do nothing;
insert into club_app.courts(id,club_id,venue_id,number)
select ('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',n from generate_series(1,6) n on conflict do nothing;
insert into club_app.sessions(id,club_id,season_id,venue_id,permit_id,starts_at,ends_at,rsvp_deadline,capacity,status)
select ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',(d||' 20:15')::timestamp at time zone 'America/Toronto',(d||' 22:15')::timestamp at time zone 'America/Toronto',(d||' 18:15')::timestamp at time zone 'America/Toronto',25,status from (values
(1,'2026-09-15','scheduled'),
(2,'2026-09-22','scheduled'),
(3,'2026-09-29','scheduled'),
(4,'2026-10-06','scheduled'),
(5,'2026-10-13','scheduled'),
(6,'2026-10-20','scheduled'),
(7,'2026-10-27','scheduled'),
(8,'2026-11-03','scheduled'),
(9,'2026-11-10','scheduled'),
(10,'2026-11-17','scheduled'),
(11,'2026-11-24','scheduled'),
(12,'2026-12-01','cancelled'),
(13,'2026-12-08','cancelled'),
(14,'2026-12-15','scheduled'),
(15,'2027-01-05','scheduled'),
(16,'2027-01-12','cancelled'),
(17,'2027-01-19','scheduled'),
(18,'2027-01-26','scheduled'),
(19,'2027-02-02','scheduled'),
(20,'2027-02-09','scheduled'),
(21,'2027-02-16','scheduled'),
(22,'2027-02-23','scheduled'),
(23,'2027-03-02','scheduled'),
(24,'2027-03-09','scheduled'),
(25,'2027-03-23','scheduled'),
(26,'2027-03-30','scheduled'),
(27,'2027-04-06','cancelled'),
(28,'2027-04-13','scheduled'),
(29,'2027-04-20','scheduled'),
(30,'2027-04-27','cancelled'),
(31,'2027-05-04','scheduled'),
(32,'2027-05-11','scheduled'),
(33,'2027-05-18','scheduled'),
(34,'2027-05-25','cancelled')
) bookings(n,d,status) on conflict do nothing;
commit;
