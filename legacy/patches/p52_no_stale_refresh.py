# p52 (September 12, 2026): a slow background refresh can no longer undo what the page has just saved.
#  - The page refreshes every 20 seconds. A refresh that left the database just before a save and came back just after
#    it carried the older session, and the page took it: the saved scores vanished from the screen until the next
#    refresh, the next save was refused as out of date, and a save that completed the round could miss the automatic
#    advance ("All courts scored! Ready to advance" without advancing). Found by the ten-session season simulation,
#    which failed at random sessions under load.
#  - Now a reply older than the version this page already holds, for the same session, is not applied. A reply for a
#    different session (a new night, whose version numbers start again) is applied as before, and so is any newer one.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""async function getKV(k){try{const r=await sbG('app_state',`key=eq.${encodeURIComponent(k)}&select=key,value,version`);if(r&&r[0]){_stateVersion[k]=r[0].version||0;return JSON.parse(r[0].value);}delete _stateVersion[k];return null;}catch(e){return null;}}""",
    """// _kvRead[k]: the version a read returned and the version this page already held when the reply arrived (p52).
const _kvRead={};
async function getKV(k){delete _kvRead[k];try{const r=await sbG('app_state',`key=eq.${encodeURIComponent(k)}&select=key,value,version`);if(r&&r[0]){_kvRead[k]={version:r[0].version||0,known:_stateVersion[k]};_stateVersion[k]=r[0].version||0;return JSON.parse(r[0].value);}delete _stateVersion[k];return null;}catch(e){return null;}}""")
sub("""    S.announcements=an||[];
    S.current=cur||null;""",
    """    S.announcements=an||[];
    {const rd=_kvRead['current_session'];
     // A reply older than a save this page has already made, for the same session, must not undo that save.
     if(rd&&rd.known!=null&&rd.version<rd.known&&S.current&&cur&&cur.id===S.current.id)_stateVersion['current_session']=rd.known;
     else S.current=cur||null;}""")
f.write_text(s)
print("p52 applied")
