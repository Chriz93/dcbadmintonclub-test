#!/usr/bin/env python3
"""Phase 11: one Undo for every match-night and roster action. Each admin action is wrapped: the database takes a
checkpoint first and discards it afterwards if nothing changed. A floating 'Undo' shows the step it will reverse.
Also: honest reminder timing (GitHub runs schedules late) — the old per-round and per-score undo buttons are replaced."""
import pathlib, re
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)

# Only async functions are wrapped (a sync caller must never receive a Promise).
WANT = {"startSession":"Start session","endSession":"End session","nextCycle":"Advance round","autoAdvanceCheck":"Advance round",
 "undoScore":"Undo score entry","clearCycleScores":"Clear round scores","resetSession":"Reset session","cancelSession":"Cancel session",
 "markAttForTab":"Attendance","markAbsentFromPlayers":"Mark absent","saveAttendanceTab":"Save attendance","saveAttendance":"Save attendance",
 "togglePlayerPresence":"Attendance","callInSpare":"Seat player","setPlayerCourt":"Change court","removePlayerFromCourtNow":"Remove from court",
 "quickAddToCourt":"Add to court","saveAssignments":"Court assignments","rebalanceCourts":"Rebalance courts","rebalancePlayerCourts":"Rebalance courts",
 "assignCourtToRegistered":"Assign court","syncCourtsFromLastSession":"Sync courts","recordCourtToss":"Record toss","markPlayerLate":"Mark late",
 "handleAbsentAndReplace":"Absent and replace","approvePlayer":"Approve player","rejectPlayer":"Reject player","toggleMembership":"Change membership",
 "promoteWaitlisted":"Promote from waitlist","promoteFromWaitlist":"Promote from waitlist","restoreSnapshot":"Restore snapshot","saveEditRegistration":"Edit registration"}
have = {k: v for k, v in WANT.items() if re.search(r"^async function " + k + r"\(", s, re.M)}
for must in ["startSession","endSession","nextCycle","autoAdvanceCheck","markAttForTab","approvePlayer","setPlayerCourt"]:
    assert must in have, must
import json
undoable = json.dumps(have, separators=(",", ":"))

rep("</style>", """#undo-pill{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(88px + env(safe-area-inset-bottom));z-index:250;max-width:92vw;}
.undo-btn{display:flex;align-items:center;gap:8px;background:#0f1f16;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(15,31,22,.35);cursor:pointer;max-width:92vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--font);}
.undo-btn .undo-ic{font-size:17px;line-height:1;}
body.has-undo{padding-bottom:140px;}
</style>""")
rep('<div class="watermark">', '<div id="undo-pill" hidden><button class="undo-btn" onclick="undoLast()" title="Undo the last admin step"><span class="undo-ic">↶</span><span><strong>Undo</strong> · <span id="undo-label"></span></span></button></div>\n<div class="watermark">')

# Tools: the unified undo and its history replace the old per-score undo.
rep("""        <button class="btn btn-warn" onclick="undoScore()">↩ Undo Last Score Entry</button>""",
    """        <button class="btn btn-warn" id="undo-tools-btn" onclick="undoLast()">↶ Undo last action</button>
        <div id="undo-history" style="font-size:12px;margin:6px 0 4px;"></div>""")
# Session controls: the same undo replaces 'Undo Last Round'.
rep("""      <button class="btn btn-ghost" onclick="undoRound()" ${_roundSnapshots.length?'':'disabled'}>↩ Undo Last Round${_roundSnapshots.length?' ('+_roundSnapshots.length+' available)':''}</button>""",
    """      <button class="btn btn-ghost" onclick="undoLast()" ${S.undoTop?'':'disabled'}>↶ Undo${S.undoTop?': '+esc(S.undoTop.label):' — nothing to undo'}</button>""")

rep("    S.rsvpAll=(S_me.organizer&&S_me.verified)?", "    await loadUndo();\n    S.rsvpAll=(S_me.organizer&&S_me.verified)?")
rep("  renderPOS('pos-standings');", "  renderPOS('pos-standings');\n  renderUndo();")
rep("async function init(){\n  signInReset();", "async function init(){\n  installUndoCheckpoints();\n  signInReset();")

rep("async function togglePaid(id){recordPaymentUI(id);}", r"""async function togglePaid(id){recordPaymentUI(id);}
// ── Undo ─────────────────────────────────────────────────────────────────────────────────────────
// Every wrapped admin action gets a database checkpoint first; if the action changed nothing the checkpoint is
// discarded. Score saves are journaled by the database itself. undoLast() restores the latest checkpoint exactly.
const UNDOABLE=__UNDOABLE__;
let _ckDepth=0,_undoing=false;
function undoLabel(name,args){
  const pn=id=>{const p=S.players.find(x=>x.id===id);return p?p.name:'player';};
  switch(name){
    case 'startSession':return `Start session ${S.sessions.length+1}`;
    case 'endSession':return S.current?`End session ${S.current.number}`:'End session';
    case 'nextCycle':case 'autoAdvanceCheck':return S.current?(S.current.cycle>=MAX_ROUNDS_PER_SESSION?`Finish round ${S.current.cycle}`:`Advance to round ${S.current.cycle+1}`):'Advance round';
    case 'setPlayerCourt':return `Move ${pn(args[0])} to Court ${args[1]}`;
    case 'markAttForTab':return `Mark ${pn(args[0])} ${args[1]}`;
    case 'callInSpare':return `Seat ${pn(args[0])}`;
    case 'approvePlayer':return `Approve ${pn(args[0])}`;
    case 'rejectPlayer':return `Reject ${pn(args[0])}`;
    case 'promoteWaitlisted':case 'promoteFromWaitlist':return `Promote ${pn(args[0])}`;
    case 'markAbsentFromPlayers':return `Mark ${pn(args[0])} absent`;
    case 'removePlayerFromCourtNow':return `Remove ${pn(args[0])} from Court ${args[1]}`;
    default:return UNDOABLE[name]||'Admin action';
  }
}
function installUndoCheckpoints(){
  Object.keys(UNDOABLE).forEach(name=>{
    const orig=window[name];if(typeof orig!=='function'||orig.__ck)return;
    const wrapped=async function(...args){
      if(!adminUnlocked||_ckDepth>0||_undoing)return orig.apply(this,args);
      _ckDepth++;let id=null;
      try{
        try{id=await rpc('checkpoint',{p_label:undoLabel(name,args)});}catch(e){toast('Note: this step could not be saved for undo ('+(e.message||'offline')+')','warn');}
        return await orig.apply(this,args);
      }finally{
        _ckDepth--;
        if(id){try{await rpc('checkpoint_settle',{p_id:id});}catch(e){}try{await loadUndo();renderUndo();}catch(e){}}
      }
    };
    wrapped.__ck=true;window[name]=wrapped;
  });
}
async function loadUndo(){
  if(!(S_me.organizer&&S_me.verified)){S.undoList=[];S.undoTop=null;return;}
  S.undoList=(await sbG('undo_journal','select=id,created_at,actor_email,label&order=id.desc&limit=10'))||[];
  S.undoTop=S.undoList[0]||null;
}
function renderUndo(){
  const pill=document.getElementById('undo-pill');if(!pill)return;
  const top=adminUnlocked?S.undoTop:null;
  const at=d=>new Date(d).toLocaleTimeString('en-CA',{hour:'numeric',minute:'2-digit'});
  pill.hidden=!top;document.body.classList.toggle('has-undo',!!top);
  if(top)document.getElementById('undo-label').textContent=`${top.label} · ${at(top.created_at)}`;
  const tb=document.getElementById('undo-tools-btn');if(tb){tb.disabled=!top;tb.textContent=top?`↶ Undo: ${top.label}`:'↶ Nothing to undo';}
  const h=document.getElementById('undo-history');
  if(h)h.innerHTML=(S.undoList||[]).length?`<div style="color:var(--muted);margin-bottom:4px;">Recent steps (newest first) — each press of Undo goes back one:</div>`+(S.undoList||[]).map((u,i)=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid var(--border);${i===0?'font-weight:700;':''}"><span>${esc(u.label)}</span><span style="color:var(--muted);white-space:nowrap;">${at(u.created_at)}</span></div>`).join(''):'<div style="color:var(--muted);">No steps recorded yet.</div>';
}
async function undoLast(){
  if(!adminUnlocked)return toast('Organizer verification required','warn');
  if(_undoing)return;
  const top=S.undoTop;if(!top)return toast('Nothing to undo','info');
  if(!confirm(`Undo "${top.label}"?\n\nThe session, courts and standings go back to exactly how they were just before this step.`))return;
  _undoing=true;
  try{
    const r=await rpc('undo_last');
    _roundSnapshots=[];
    const sel=document.getElementById('sc-sel');if(sel)sel.value='';
    const area=document.getElementById('score-area');if(area)area.innerHTML='';
    await loadAll();renderAll();
    toast(`Undone: ${r&&r.undone?r.undone:top.label}`,'success');
  }catch(e){toast('Not undone: '+e.message,'error');}
  finally{_undoing=false;}
}""".replace("__UNDOABLE__", undoable))

# Honest reminder timing: GitHub starts scheduled jobs late, often by an hour or more.
rep("The scheduled job checks every 10 minutes. These buttons ask it to act on the next check instead of waiting for the weekly window.",
    "A scheduled check runs through the day. GitHub often starts it late, so allow up to a couple of hours. These buttons ask it to act on its next check instead of waiting for the weekly window.")
rep("`Test email queued for ${myEmail()} — sent within about 10 minutes`", "`Test email queued for ${myEmail()} — sent on the next scheduled check (usually within an hour or two)`")
rep("`Reminders for Session ${n} queued — sent within about 10 minutes`", "`Reminders for Session ${n} queued — sent on the next scheduled check (usually within an hour or two)`")
rep("waiting for the next check (within about 10 minutes).", "waiting for the next scheduled check (usually within an hour or two).")
p.write_text(s); print("patched; wrapped", len(have), "actions")
