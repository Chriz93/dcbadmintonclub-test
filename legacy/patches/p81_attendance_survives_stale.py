# p81 (September 18, 2026): an attendance mark is not lost when the page is behind.
#  From the organizer: "the attendance marking, after I mark its going away, I marked absent and present for few
#  players, but then its grayed out or cancels my selection after few seconds".
#  Why: every save carries the version the page last read, and the database refuses any save whose version is not the
#  current one ("Stale state: refresh before saving"). Their page had been open since the previous night — version 25
#  against 35 in the database — so every mark was refused, the page reloaded, and the mark vanished. Nothing reached
#  the database at all, so the night's attendance never changed.
#  Now: a refused mark is applied again to the state the reload brought back, and saved. Only if that fails too does
#  the organizer see an error — and then the tab shows what the database really holds, not a mark that never landed.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""      if(cur.latePlayers.some(l=>l.playerId===id&&(l.pending||l.round===cy)))return toast(`${first} is already marked late this round`,'info');""",
    """      if(cur.latePlayers.some(l=>l.playerId===id&&(l.pending||l.round===cy))){toast(`${first} is already marked late this round`,'info');return false;} // p81: the guard still stops the action""")
sub("""async function markAttForTab(id,status,court){
  const first=S.players.find(p=>p.id===id)?.name.split(' ')[0]||'Player';
  if(S.current){""",
    """async function markAttForTab(id,status,court){
  const first=S.players.find(p=>p.id===id)?.name.split(' ')[0]||'Player';
  // p81: applying the mark is its own step, so it can be applied again to the state a reload brings back. It returns
  // false when a guard inside it refuses the mark (marking someone late twice in a round), and the caller stops there.
  const applyMark=()=>{
  if(S.current){""")
sub("""  }else{
    if(status==='late')status='present';
    if(!S.preAttendance)S.preAttendance={};
    S.preAttendance[id]=status;
  }
  // Save immediately (no debounce — attendance is critical), then confirm
  if(S.current)await setKV('current_session',S.current);
  else await setKV('pre_session_attendance',S.preAttendance||{});""",
    """  }else{
    if(status==='late')status='present';
    if(!S.preAttendance)S.preAttendance={};
    S.preAttendance[id]=status;
  }
  return true;
  };
  if(!applyMark())return;
  // Save immediately (no debounce — attendance is critical), then confirm.
  const saveMark=async()=>{if(S.current)await setKV('current_session',S.current);else await setKV('pre_session_attendance',S.preAttendance||{});};
  try{await saveMark();}
  catch(e){
    // p81: the page was behind — another device (or this one, earlier) had saved. setKV has already reloaded, so put
    // the mark on the state that came back and save that. A mark must never disappear without saying so.
    if(e&&(e.code==='40001'||/Stale state/.test(e.message||''))){
      applyMark();
      try{await saveMark();}
      catch(e2){toast(`${first} not marked: `+(e2.message||'try again'),'error');await loadAll();renderAttendanceTab();renderAdminPlayers();renderCourts();return;}
    }else{toast(`${first} not marked: `+(e.message||'try again'),'error');await loadAll();renderAttendanceTab();renderAdminPlayers();return;}
  }""")

# The Players tab marks through the same door: its debounced save gets the same second chance.
sub("""  clearTimeout(_attSaveTimer);
  _attSaveTimer=setTimeout(async()=>{_attSaveTimer=null;
    if(S.current){await setKV('current_session',S.current);}
    else{await setKV('pre_session_attendance',S.preAttendance);}
  },1000);""",
    """  clearTimeout(_attSaveTimer);
  _attSaveTimer=setTimeout(async()=>{_attSaveTimer=null;
    const save=async()=>{if(S.current){await setKV('current_session',S.current);}else{await setKV('pre_session_attendance',S.preAttendance);}};
    const mark=S.current?(S.current.attendance||{})[id]:(S.preAttendance||{})[id];
    try{await save();}
    catch(e){ // p81: behind the database? the reload has refreshed the state — put the mark back on it and save.
      if(e&&(e.code==='40001'||/Stale state/.test(e.message||''))){
        if(S.current){S.current.attendance={...(S.current.attendance||{})};if(mark===undefined)delete S.current.attendance[id];else S.current.attendance[id]=mark;}
        else{S.preAttendance={...(S.preAttendance||{})};if(mark===undefined)delete S.preAttendance[id];else S.preAttendance[id]=mark;}
        try{await save();}catch(e2){toast('Not marked: '+(e2.message||'try again'),'error');await loadAll();renderAdminPlayers();}
      }else{toast('Not marked: '+(e.message||'try again'),'error');await loadAll();renderAdminPlayers();}
    }
  },1000);""")

f.write_text(s)
print("p81 applied")
