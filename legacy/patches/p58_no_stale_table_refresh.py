# p58 (September 13, 2026): a background refresh never undoes a save on screen (players, payments and every other table).
#  - Found by the generated tests (Admin extras 061): a private note was saved, the database had it, yet the Players row
#    still showed "add a note". A background refresh that started before the save read the old player list, finished
#    after the save's own reload and replaced it, so the change vanished until the next refresh 20 seconds later. p52 and
#    the audit remediation guarded only the shared session state (app_state); saves to tables were not guarded.
#  - Now every successful save (table writes, upserts and every server function except the two read-only ones) is
#    counted, and a page load that started before the latest save discards its result ('stale'); the save's own reload
#    shows the fresh data. Callers treat 'stale' as success and draw the newer data already on the page.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""async function sbP(t,d){""", """// p58: successful saves this page has made. A page load that started before the latest one discards its result.
let _writeSeq=0;const READ_RPCS=new Set(['admin_status','list_league_snapshots']);
async function sbP(t,d){""")
sub("""  if(!r.ok){const e=new Error(j?.message||`Save refused (${r.status})`);e.code=j?.code;e.status=r.status;toast(e.message,'error');throw e;}
  return j;
}""", """  if(!r.ok){const e=new Error(j?.message||`Save refused (${r.status})`);e.code=j?.code;e.status=r.status;toast(e.message,'error');throw e;}
  _writeSeq++;return j;
}""")
sub("""  if(!r.ok){const txt=await r.text();throw new Error(`sbUps ${t} ${r.status}: ${txt.substring(0,200)}`);}
  return r.json();""", """  if(!r.ok){const txt=await r.text();throw new Error(`sbUps ${t} ${r.status}: ${txt.substring(0,200)}`);}
  _writeSeq++;return r.json();""")
sub("""if(!r.ok){const err=new Error((j&&j.message)||'Request refused');err.code=j&&j.code;err.status=r.status;throw err;}return j;}""",
    """if(!r.ok){const err=new Error((j&&j.message)||'Request refused');err.code=j&&j.code;err.status=r.status;throw err;}if(!READ_RPCS.has(fn))_writeSeq++;return j;}""")
sub("""  _activeLoads++;
  const epoch=_accountEpoch,""", """  _activeLoads++;
  const seq=_writeSeq,epoch=_accountEpoch,""")
sub("""    if(epoch!==_accountEpoch||!_session)return false;
    applySeasonConfig(""", """    if(epoch!==_accountEpoch||!_session)return false;
    if(seq!==_writeSeq)return 'stale'; // p58: a save finished while this load was in flight; the save's own reload shows it
    applySeasonConfig(""")
f.write_text(s)
print("p58 applied")
