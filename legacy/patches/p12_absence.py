#!/usr/bin/env python3
"""Phase 4b: a no-show is remembered, not erased. Marking a player absent takes them off tonight's court only;
at session end they move one court down and their no-show count grows. Their court is never zeroed."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)
rep("""  if(status==='absent'&&court){
    if(S.current){
      S.current.assignments[court]=(S.current.assignments[court]||[]).filter(pid=>pid!==id);
      await setKV('current_session',S.current);
    }
    await sbU('players',id,{current_court:0});
    toast(S.players.find(p=>p.id===id)?.name.split(' ')[0]+' marked absent — removed from Court '+court,'warn');""",
"""  if(status==='absent'&&court){
    if(S.current){
      S.current.assignments[court]=(S.current.assignments[court]||[]).filter(pid=>pid!==id);
      if(!S.current.absentFrom)S.current.absentFrom={};S.current.absentFrom[id]=court; // remembered for the demotion at session end
      await setKV('current_session',S.current);
    }
    toast(S.players.find(p=>p.id===id)?.name.split(' ')[0]+' marked absent — off Court '+court+' tonight, one court down next week','warn');""")
rep("""  if(S.current){
    for(let c=1;c<=NC;c++){S.current.assignments[c]=(S.current.assignments[c]||[]).filter(pid=>pid!==id);}
    if(!S.current.attendance)S.current.attendance={};
    S.current.attendance[id]='absent';
    await setKV('current_session',S.current);
  }
  // Move to bench (court 0)
  await sbU('players',id,{current_court:0});
  await loadAll();renderAll();
  toast(`${p.name} marked absent — moved from Court ${oldCourt} to bench`,'success');""",
"""  if(S.current){
    for(let c=1;c<=NC;c++){S.current.assignments[c]=(S.current.assignments[c]||[]).filter(pid=>pid!==id);}
    if(!S.current.attendance)S.current.attendance={};
    S.current.attendance[id]='absent';
    if(!S.current.absentFrom)S.current.absentFrom={};S.current.absentFrom[id]=oldCourt||NC;
    await setKV('current_session',S.current);
  }
  await loadAll();renderAll();
  toast(`${p.name} marked absent — off Court ${oldCourt} tonight, one court down next week`,'success');""")
rep("""  const absentIds=new Set();
  const assignedIds=new Set();
  for(let c=1;c<=NC;c++)(S.current.assignments[c]||[]).forEach(id=>assignedIds.add(id));
  assignedIds.forEach(id=>{
    if(att[id]==='absent') absentIds.add(id);
  });""",
"""  // Every player marked absent tonight, whether or not they were already taken off a court.
  const absentIds=new Set(Object.entries(att).filter(([,v])=>v==='absent').map(([id])=>parseInt(id)).filter(id=>S.players.some(p=>p.id===id)));""")
rep("""      let fromCourt=0;for(let c=1;c<=NC;c++)if((S.current.assignments[c]||[]).includes(id)){fromCourt=c;break;}
      if(!fromCourt)fromCourt=p.currentCourt||NC;""",
"""      let fromCourt=(S.current.absentFrom||{})[id]||0;
      if(!fromCourt)for(let c=1;c<=NC;c++)if((S.current.assignments[c]||[]).includes(id)){fromCourt=c;break;}
      if(!fromCourt)fromCourt=p.currentCourt||NC;""")
rep("""  Object.values(S.current.scores||{}).forEach(sc=>{[sc.a1,sc.a2,sc.b1,sc.b2].forEach(id=>{if(id!=null)_seen.add(id);});});""","""  Object.values(S.current.scores||{}).forEach(sc=>{[sc.a1,sc.a2,sc.b1,sc.b2].forEach(id=>{if(id!=null)_seen.add(id);});});
  Object.keys(S.current.attendance||{}).forEach(id=>_seen.add(parseInt(id))); // absent players keep their name in history too""")
p.write_text(s); print("patched")
