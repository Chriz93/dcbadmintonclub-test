# p111 (October 19, 2026): a list of people you have to FIND somebody in is alphabetical.
#  THE ORGANIZER: "all names apart from rankings, standings etc which doesnt require ranking or point order, make all
#  other places alphabetical order RSVP, Registered players etc".
#  WHAT IT WAS. None of these lists was sorted at all. They came out in whatever order the database returned, which is
#  roughly the order people registered -- so a roster of thirty was a linear scan every time, and the position of a
#  name changed as people joined. The Drop-in picker (p99) was the only list in the app already doing this right.
#  THE LINE. Two different kinds of list look the same and are not:
#    a ROSTER is a list you search -- there is no meaning in the order, so the order should help you find a name;
#    a RANKING, a QUEUE or a LOG carries its meaning IN the order, and sorting it by name destroys information.
#  So these are now alphabetical: the RSVP table (inside each answer group), Registered (pending, approved and the
#  admin-added lists), Admin > Players (within each court, which still groups by court), the Assign board's "not
#  playing" pool, the attendance list and spare pool, and Past Players.
#  AND THESE ARE DELIBERATELY LEFT ALONE, because their order IS the information:
#    the WAITLIST          -- position in it is the person's place in line (promoteWaitlisted takes the first)
#    the spare CLAIMS      -- ranked in the order the organizer called them in (p110)
#    the COURTS and the Assign board's courts -- wins, then points scored (p107)
#    Standings and Rankings -- the rating (p105)
#    vote changes, game history, sessions -- chronological
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# One way to order people, so every roster in the app agrees. The id breaks a tie, so two players with the same name
# never swap places between two redraws of the same screen.
sub("""function isRegularMember(p){return !!p&&p.approved&&!p.waitlisted&&p.membershipType!=='spare';}""",
    """// p111: how a roster is ordered. 'en' and sensitivity 'base' are given explicitly so the order does not depend on
// the machine's locale, and so case and accents do not split a name away from where a reader expects to find it.
function byName(a,b){return String((a&&a.name)||'').localeCompare(String((b&&b.name)||''),'en',{sensitivity:'base'})||(((a&&a.id)||0)-((b&&b.id)||0));}
function isRegularMember(p){return !!p&&p.approved&&!p.waitlisted&&p.membershipType!=='spare';}""")

# RSVP. The table groups by the answer given and lists regulars before spares; both of those carry meaning, so only
# the order WITHIN each of those blocks changes.
sub("""  const people=[...S.players.filter(isRegularMember),...S.players.filter(isSpareMember)];""",
    """  const people=[...S.players.filter(isRegularMember).sort(byName),...S.players.filter(isSpareMember).sort(byName)]; // p111""")

# Registered. pending, approved and the admin-added lists are rosters. `waitlisted` is NOT sorted here: it is a queue,
# and promoteWaitlisted() takes whoever registered first.
sub("""  const pending=selfReg.filter(p=>!p.approved&&!p.waitlisted);
  const approved=selfReg.filter(p=>p.approved&&!p.waitlisted);""",
    """  const pending=selfReg.filter(p=>!p.approved&&!p.waitlisted).sort(byName);          // p111
  const approved=selfReg.filter(p=>p.approved&&!p.waitlisted).sort(byName);          // p111""")

sub("""  const notRegistered=adminAdded.filter(p=>!p.waiverSigned);""",
    """  const notRegistered=adminAdded.filter(p=>!p.waiverSigned).sort(byName); // p111""")

# Admin > Players. Still grouped by court, which is the point of the screen; alphabetical inside each court.
sub("""  const sortedPlayers=[...activePlayers].sort((a,b)=>a.currentCourt-b.currentCourt);""",
    """  const sortedPlayers=[...activePlayers].sort((a,b)=>a.currentCourt-b.currentCourt||byName(a,b)); // p111""")

sub("""  const unassigned=S.players.filter(p=>p.currentCourt===0||!p.currentCourt);""",
    """  const unassigned=S.players.filter(p=>p.currentCourt===0||!p.currentCourt).sort(byName); // p111""")

# The Assign board's "not playing" pool. The courts themselves stay on wins-then-points (p107) -- this is the pool
# beside them, which is a roster you search.
sub("""  const unassigned=S.current?S.players.filter(p=>!assignedSet.has(p.id))
    :S.players.filter(p=>p.approved&&!p.waitlisted&&!assignedSet.has(p.id));""",
    """  const unassigned=(S.current?S.players.filter(p=>!assignedSet.has(p.id))
    :S.players.filter(p=>p.approved&&!p.waitlisted&&!assignedSet.has(p.id))).sort(byName); // p111""")

# Attendance: the flat list you tick people off on, and the spare pool beside it.
sub("""  const attendees=S.players.filter(p=>assignedIds.has(p.id)||att[p.id]);""",
    """  const attendees=S.players.filter(p=>assignedIds.has(p.id)||att[p.id]).sort(byName); // p111""")

sub("""  const sparePool=S.players.filter(p=>(!p.currentCourt||p.currentCourt===0)&&p.id>0);""",
    """  const sparePool=S.players.filter(p=>(!p.currentCourt||p.currentCourt===0)&&p.id>0).sort(byName); // p111""")

# Past Players: a filing cabinet, searched by name.
sub("""  const list=all.filter(p=>!q||[p.name,p.email,p.phone].some(v=>String(v||'').toLowerCase().includes(q)));""",
    """  const list=all.filter(p=>!q||[p.name,p.email,p.phone].some(v=>String(v||'').toLowerCase().includes(q))).sort(byName); // p111""")

f.write_text(s)
print("p111 applied")
