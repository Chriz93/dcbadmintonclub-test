# p57 (September 13, 2026): Attendance "Present" means on a court tonight.
#  - Found by the organizer on TEST: Session 1 Attendance showed 24 present while 22 players were on the courts. Two
#    regulars who had declined were marked "present" after the start (the Admin → Players tag cycles excused → blank →
#    present) without being seated, and the counter counted attendance marks rather than players on courts.
#  - Now the Present count is the players on a court who are marked present, a new "on courts" count shows the total,
#    and anyone marked present without a court is listed with Seat (through the court engine) and "Not here" (back to
#    excused if they voted not coming). During a session the Admin → Players tag follows the same rule: present means
#    seated through the court engine, absent leaves the court through it.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""  const presentCount=Object.values(att).filter(v=>v==='present').length;\n""", "")
sub("""  const unmarkedCount=[...courtPlayerIds].filter(id=>!att[id]).length;\n""",
    """  const unmarkedCount=[...courtPlayerIds].filter(id=>!att[id]).length;
  // p57: Present counts players on a court tonight who are marked present, so the numbers add up to the courts. Anyone
  // marked present without a court is listed below with Seat instead of being counted.
  const presentCount=[...courtPlayerIds].filter(id=>att[id]==='present').length;
  const notSeated=S.current?Object.entries(att).filter(([id,v])=>v==='present'&&!courtPlayerIds.has(+id)).map(([id])=>S.players.find(p=>p.id===+id)).filter(Boolean):[];
""")
sub("""    <span class="tag tg-gray">— ${unmarkedCount} Unmarked</span>
  </div>`;""", """    <span class="tag tg-gray">— ${unmarkedCount} Unmarked</span>
    <span class="tag tg-teal" id="att-on-courts">🏸 ${courtPlayerIds.size} on courts</span>
  </div>`;
  if(notSeated.length)html+=`<div class="alert alert-warn" id="att-not-seated" role="status" style="margin-bottom:10px;font-size:12px;">
    <strong>Marked present but not on a court (${notSeated.length})</strong>
    <div style="margin:4px 0 6px;">They are not counted as present until they have a court. Seat puts them on their own court, or the nearest court with room.</div>
    ${notSeated.map(p=>`<div class="att-line" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:3px 0;"><span style="flex:1 1 120px;font-weight:700;">${esc(p.name)}</span><button class="btn btn-success btn-sm" style="margin:0;" aria-label="Seat ${esc(p.name)} on a court" onclick="changePlayerAttendance(${p.id},'present')">🪑 Seat</button><button class="btn btn-ghost btn-sm" style="margin:0;" aria-label="${esc(p.name)} is not here" onclick="clearNotSeated(${p.id})">Not here</button></div>`).join('')}
  </div>`;""")
sub("""  if(S.current){
    if(!S.current.attendance)S.current.attendance={};
    const cur=S.current.attendance[id];
    if(!cur||cur==='unmarked'){S.current.attendance[id]='present';}
    else if(cur==='present'){S.current.attendance[id]='absent';}
    else{delete S.current.attendance[id];}
  }else{""", """  if(S.current){
    // p57: during a session the tag follows the Attendance tab's rule: present means on a court. A player without a
    // court is seated through the court engine; a seated player marked present is marked absent the same way.
    const cur=(S.current.attendance||{})[id],seated=!!courtOfPlayer(id);
    if(!seated||cur==='present')return changePlayerAttendance(id,seated?'absent':'present');
    if(cur==='absent')return changePlayerAttendance(id,'present');
    S.current.attendance={...(S.current.attendance||{}),[id]:'present'};renderAdminPlayers();
    try{await setKV('current_session',S.current);}catch(e){toast(e.message,'error');}
    await loadAll();renderAll();return;
  }else{""")
sub("""let _attSaveTimer=null;""", """// p57: undo a "present" mark for someone with no court tonight (back to excused if they voted not coming; no penalty).
async function clearNotSeated(id){
  if(!S.current||courtOfPlayer(id))return;
  const next=JSON.parse(JSON.stringify(S.current));next.attendance=next.attendance||{};
  if((S.rsvp||{})[id]==='notcoming')next.attendance[id]='declined';else delete next.attendance[id];
  try{await setKV('current_session',next);}catch(e){return toast(e.message,'error');}
  await loadAll();renderAll();toast(`${S.players.find(p=>p.id===id)?.name||'Player'} is no longer marked present`,'info');
}
let _attSaveTimer=null;""")
f.write_text(s)
print("p57 applied")
