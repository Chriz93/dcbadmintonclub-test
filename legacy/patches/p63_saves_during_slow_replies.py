# p63 (September 13, 2026): saves stay on screen and forms say when they are ready, on a slow connection.
#  Found by GitHub's checks on slower machines (three tests failed at random). Reproduced with a slow, uneven test
#  connection (SLOW_NET=40-400: 38 of 61 Adjust, presence, match-night and season cases failed without this patch), and
#  tabs/slow-network.spec.ts holds one reply at the exact moment each went wrong:
#  - Round advance: once every court's scores were in, the next round's score form appeared while the round was still
#    being saved; pressing Save only answered "Round is advancing — save again in a moment". Save buttons are now shown
#    disabled with the reason while the round advances, and turn on (keeping anything typed) when it is saved.
#  - End Session: once the last round's scores were in, the session showed as complete while that round was still being
#    saved; End Session then sent the older version and was refused ("Stale state: refresh before ending"). It is now
#    shown disabled with the reason until the round is saved, and endSession answers with the reason meanwhile.
#  - A page reload that finished while a save was still on its way, or while the Players tag's one-second attendance
#    save was waiting, put the older data back on screen: an attendance mark flipped back, the "press Adjust courts"
#    hint was left out. A reload is now repeated instead of shown when a save started while it ran, is still on its way,
#    or is waiting; it waits for those saves first (at most three tries, as in p59).
#  - Two quick taps (the Players tag: ✅ at once, then ❌): the second save went out with the version the page held
#    before the first reply arrived, and the database refused it as "Someone else saved newer changes". This page's
#    saves of one shared record now go one after another, each with the version the previous one returned.
#  - On a slow connection an attendance mark, a tap on the Players tag during a session, a Move on the Assign tab and
#    "absent and replace" showed only after the whole page reload that follows the save (about twenty reads): several
#    seconds with nothing but a message. They now show as soon as the save is confirmed, and the reload follows.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

# Saves this page has started and not yet finished.
sub("let _writeSeq=0;const READ_RPCS=new Set(['admin_status','list_league_snapshots']);",
    "let _writeSeq=0;const READ_RPCS=new Set(['admin_status','list_league_snapshots']);\n"
    "// p63: saves started, and saves on their way (a reload that overlaps one is repeated, not shown).\n"
    "let _writeStarts=0,_writesOpen=0;\n"
    "async function _writing(f){_writeStarts++;_writesOpen++;try{return await f();}finally{_writesOpen--;}}")
sub("async function restWrite(path,method,data){\n  const r=await sbFetch(",
    "async function restWrite(path,method,data){return _writing(()=>_restWrite(path,method,data));}\n"
    "async function _restWrite(path,method,data){\n  const r=await sbFetch(")
sub("async function sbUps(t,d,conflict=''){\n  const url=",
    "async function sbUps(t,d,conflict=''){return _writing(()=>_sbUps(t,d,conflict));}\n"
    "async function _sbUps(t,d,conflict=''){\n  const url=")
sub("async function rpc(fn,args){const r=await sbFetch(",
    "async function rpc(fn,args){return READ_RPCS.has(fn)?_rpc(fn,args):_writing(()=>_rpc(fn,args));}\n"
    "async function _rpc(fn,args){const r=await sbFetch(")

# This page's saves of one shared record, one after another.
sub("async function setKV(k,v){try{const nv=await rpc(",
    "// p63: this page's saves of one shared record go one after another, each with the version the previous one\n"
    "// returned (a quick second tap was sent with the older version and refused as someone else's newer change).\n"
    "const _kvQueue={};\n"
    "async function setKV(k,v){const prev=_kvQueue[k];let done;const mine=new Promise(r=>done=r);_kvQueue[k]=mine;\n"
    " try{if(prev)await prev;return await _setKV(k,v);}finally{done();if(_kvQueue[k]===mine)delete _kvQueue[k];}}\n"
    "async function _setKV(k,v){try{const nv=await rpc(")

# The reload: repeated when a save overlapped it, after waiting for the saves.
sub("async function loadAll(){for(let k=0;k<3;k++){const r=await _loadAllOnce();if(r!=='stale')return r;}return 'stale';}",
    "async function loadAll(){for(let k=0;k<3;k++){const r=await _loadAllOnce();if(r!=='stale')return r;await _savesSettled();}return 'stale';}\n"
    "// p63: wait (at most three seconds) for saves on their way and the attendance save that is waiting.\n"
    "async function _savesSettled(){for(let i=0;i<150&&(_writesOpen||_attSaveTimer);i++)await new Promise(r=>setTimeout(r,20));}")
sub("  const seq=_writeSeq,epoch=_accountEpoch,draft={...S},reads={};",
    "  const seq=_writeSeq,ws=_writeStarts,epoch=_accountEpoch,draft={...S},reads={};")
sub("    if(seq!==_writeSeq)return 'stale'; // p58: a save finished while this load was in flight; the save's own reload shows it",
    "    if(seq!==_writeSeq)return 'stale'; // p58: a save finished while this load was in flight; the save's own reload shows it\n"
    "    if(ws!==_writeStarts||_writesOpen||_attSaveTimer)return 'stale'; // p63: a save started, is on its way, or is waiting")

# The Players tag's attendance save: waiting until its timer fires, then on its way (counted by _writing).
sub("  _attSaveTimer=setTimeout(async()=>{\n    if(S.current){await setKV('current_session',S.current);}",
    "  _attSaveTimer=setTimeout(async()=>{_attSaveTimer=null;\n    if(S.current){await setKV('current_session',S.current);}")

# The mark and the Players tag show as soon as their save is confirmed; the reload follows.
sub("  await loadAll();renderAttendanceTab();renderCourts();renderAdmin",
    "  renderAttendanceTab(); // p63: the mark shows as soon as it is saved; the reload below follows\n"
    "  await loadAll();renderAttendanceTab();renderCourts();renderAdmin")
# The same for every court change saved as a new session (the Players tag, Move on the Assign tab, absent and replace).
sub(" try{await setKV('current_session',next);await loadAll();renderAll();",
    " try{await setKV('current_session',next);S.current=next;renderAll(); // p63: shown once saved; the reload follows\n"
    " await loadAll();renderAll();", count=3)

# Save buttons while the round advances.
sub("let _autoAdvancing=false;\nasync function autoAdvanceCheck(){",
    "let _autoAdvancing=false;\n"
    "// p63: while a round advances, Save is shown disabled with the reason; when it is saved the form is drawn again\n"
    "// (keeping anything typed) with Save on.\n"
    "function advanceLock(){return _autoAdvancing?' disabled title=\"The round is advancing. Save when this button turns on.\"':'';}\n"
    "function endAdvance(){_autoAdvancing=false;if(parseInt(document.getElementById('sc-sel')?.value))renderScoreEntry();}\n"
    "async function autoAdvanceCheck(){")
sub("finally{_autoAdvancing=false;}", "finally{endAdvance();}", count=3)
sub('<button class="btn btn-sm btn-primary" style="margin-top:6px;width:100%;" onclick="saveGameScore(${court},${g})">',
    '<button class="btn btn-sm btn-primary" style="margin-top:6px;width:100%;"${advanceLock()} onclick="saveGameScore(${court},${g})">')
sub('html+=`<button class="btn btn-success" id="sbtn_${court}" onclick="saveScores(${court})">',
    'html+=`<button class="btn btn-success" id="sbtn_${court}"${advanceLock()} onclick="saveScores(${court})">')
# End Session waits for the last round's save.
sub("async function endSession(early=false,reason=''){\n  if(!S.current)return toast('No active session','warn');",
    "async function endSession(early=false,reason=''){\n  if(!S.current)return toast('No active session','warn');\n"
    "  if(_autoAdvancing)return toast('The last round is still being saved — end the session when the button turns on.','warn'); // p63")
sub('<button class="btn btn-primary" style="width:100%;font-size:14px;" onclick="endSession()">',
    '<button class="btn btn-primary" style="width:100%;font-size:14px;"${_autoAdvancing?\' disabled title="The last round is still being saved. End the session when this button turns on."\':\'\'} onclick="endSession()">')

f.write_text(s)
print("p63 applied")
