#!/usr/bin/env python3
"""Phase 11c. Only the score save that completes a round advances it. An Undo voids any advance already scheduled,
and a finished-but-held round shows 'Round N is complete — correct any score, then Next round'. Found by the Undo
scenario: a pending auto-advance fired after the Undo and re-advanced the round. Also keeps an invite typed while the
previous one is still saving."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new):
    global s
    assert old in s, "anchor missing: " + old[:70]
    s = s.replace(old, new, 1)
rep("let _ckDepth=0,_undoing=false;", "let _ckDepth=0,_undoing=false,_undoEpoch=0;")
rep("      if(!adminUnlocked||_ckDepth>0||_undoing)return orig.apply(this,args);",
    "      if(name==='autoAdvanceCheck'&&_undoing)return; // never advance in the middle of an undo\n      if(!adminUnlocked||_ckDepth>0||_undoing)return orig.apply(this,args);")
rep("  if(!(await persistCourtScores(court,cy,{[key]:entry})))return;", "  const wasDone=allCourtsDone(),ep=_undoEpoch;\n  if(!(await persistCourtScores(court,cy,{[key]:entry})))return;")
rep("  // Auto-advance if all games for this court are done\n  setTimeout(()=>autoAdvanceCheck(),500);",
    "  // Only the save that completes the round advances it; corrections to a complete round wait for Next round.\n  if(!wasDone)setTimeout(()=>{if(ep===_undoEpoch)autoAdvanceCheck();},500);")
rep("  if(!(await persistCourtScores(court,cy,payload))){", "  const wasDone=allCourtsDone(),ep=_undoEpoch;\n  if(!(await persistCourtScores(court,cy,payload))){")
rep("  // Auto-advance: if this court is fully scored, try to advance automatically\n  setTimeout(()=>autoAdvanceCheck(),500);",
    "  // Only the save that completes the round advances it; corrections to a complete round wait for Next round.\n  if(!wasDone)setTimeout(()=>{if(ep===_undoEpoch)autoAdvanceCheck();},500);")
rep("    const r=await rpc('undo_last');\n", "    const r=await rpc('undo_last');\n    _undoEpoch++; // any round-advance scheduled before the undo is void\n")
rep("function renderUndo(){", """function renderAdvanceBanner(){
  const area=document.getElementById('score-area');if(!area||!area.parentNode)return;
  let b=document.getElementById('advance-banner');
  if(!b){b=document.createElement('div');b.id='advance-banner';area.parentNode.insertBefore(b,area);}
  const show=!!(adminUnlocked&&S.current&&!S.current.completed&&allCourtsDone());
  b.innerHTML=show?`<div class="alert alert-info" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><span>Round ${S.current.cycle} is complete. Correct any score first, then move on.</span><button class="btn btn-primary btn-sm" onclick="nextCycle()">${S.current.cycle>=MAX_ROUNDS_PER_SESSION?'Finish the round':'Next round'} →</button></div>`:'';
}
function renderUndo(){""")
rep("  renderPOS('pos-standings');\n  renderUndo();", "  renderPOS('pos-standings');\n  renderUndo();renderAdvanceBanner();")
rep("  document.getElementById('inv-email').value='';document.getElementById('inv-note').value='';",
    "  if(g('inv-email').trim().toLowerCase()===email){document.getElementById('inv-email').value='';document.getElementById('inv-note').value='';} // keep anything typed meanwhile")
p.write_text(s); print("patched")
