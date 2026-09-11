# p26: defects found while writing the coverage-gap suites (September 11, 2026).
#  24. Admin-note title showed names like "O&#39;Connor" (openModal sets the title as text; the name was escaped first).
#  25. My season told a player who declared "paid in full" that the season fee was owing, with the e-transfer address.
#  26. Stats and the season PDF always counted 0 shuttles: they read per-player fields from the per-court distribution.
#  27. Adding a player from the court popup to a full court took them off their own court before refusing.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

# 24
sub("""openModal('📝 Admin Note — '+esc(p.name),""", """openModal('📝 Admin Note — '+p.name,""")

# 25
sub("""(d.bal.due===0?'Season fee paid ✅':`Season fee: $${d.bal.due} owing · e-transfer to ${ORGANIZER_ETRANSFER}`)""",
    """(d.bal.due===0?'Season fee paid ✅':me.declaredPayment==='paid_full'?'Season fee: payment reported — the admin will confirm it':`Season fee: $${d.bal.due} owing · e-transfer to ${ORGANIZER_ETRANSFER}`)""")

# 26 — a session's distribution is {court: {recipients:[{playerId, birdsReceived}], total}}
sub("""      Object.values(s.birdDistribution||{}).forEach(bd=>{if(bd.playerId===p.id)totalBirds+=bd.birdsReceived;});""",
    """      Object.values(s.birdDistribution||{}).forEach(bd=>(bd.recipients||[]).forEach(r=>{if(r.playerId===p.id)totalBirds+=r.birdsReceived||0;}));""")
sub("""S.sessions.forEach(s=>Object.values(s.birdDistribution||{}).forEach(b=>totalBirds+=b.birdsReceived||0));""",
    """S.sessions.forEach(s=>Object.values(s.birdDistribution||{}).forEach(b=>totalBirds+=b.total||0));""")
sub("""let birds=0;Object.values(s.birdDistribution||{}).forEach(b=>birds+=b.birdsReceived||0);""",
    """let birds=0;Object.values(s.birdDistribution||{}).forEach(b=>birds+=b.total||0);""")

# 27
sub("""  const a=S.current.assignments;
  for(let c=1;c<=NC;c++)a[c]=(a[c]||[]).filter(id=>id!==pid);
  if(!a[court])a[court]=[];
  if(a[court].length>=courtCap(court))return toast('Court full','warn');""", """  const a=S.current.assignments;
  if((a[court]||[]).filter(id=>id!==pid).length>=courtCap(court))return toast('Court full','warn');   // refuse before moving anyone
  for(let c=1;c<=NC;c++)a[c]=(a[c]||[]).filter(id=>id!==pid);
  if(!a[court])a[court]=[];""")

f.write_text(s)
print("p26 applied")
