# p60 (September 13, 2026): every league date and time is shown the same on every device (review finding 14).
#  - Found by the first GitHub run of the page's tests, whose machines use UTC: 11 displays still used the device's own
#    time zone (announcement and registration times, vote-change and adjustment times, payment and refund times,
#    snapshot times, the PDF date, Q&A dates). On a phone set to another zone, Sunday 10 PM showed as Monday 2 AM.
#    The tests had passed only because this Mac is in the league's zone.
#  - Now moments in time are shown in the league's time zone (LEAGUE_TZ, America/Toronto from the season settings), and
#    calendar dates ("Sep 15, 2026") are built from the date itself, so they are the same in every zone.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

# Calendar dates: from the date's own parts, whatever the device's zone.
sub("new Date(y,m-1,d,12).toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'})",
    "new Date(Date.UTC(y,m-1,d,12)).toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})")
# Moments in time: in the league's time zone.
sub("const dateStr=d.toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'})",
    "const dateStr=d.toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric',timeZone:LEAGUE_TZ})")
sub("toLocaleDateString('en-CA',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})",
    "toLocaleDateString('en-CA',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:LEAGUE_TZ})", 3)
sub("toLocaleTimeString('en-CA',{hour:'numeric',minute:'2-digit'})",
    "toLocaleTimeString('en-CA',{hour:'numeric',minute:'2-digit',timeZone:LEAGUE_TZ})", 2)
sub("toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:true})",
    "toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:LEAGUE_TZ})")
sub("toLocaleString('en-CA',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})",
    "toLocaleString('en-CA',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:LEAGUE_TZ})")
sub("toLocaleDateString('en-CA',{year:'numeric',month:'long',day:'numeric'})",
    "toLocaleDateString('en-CA',{year:'numeric',month:'long',day:'numeric',timeZone:LEAGUE_TZ})")
sub("toLocaleDateString('en-CA',{month:'short',day:'numeric'})",
    "toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:LEAGUE_TZ})")
assert not [m for m in __import__("re").findall(r"toLocale[A-Za-z]*String\('en-CA',\{[^}]*\}", s) if "timeZone" not in m], "a date display without a time zone is left"
f.write_text(s)
print("p60 applied")
