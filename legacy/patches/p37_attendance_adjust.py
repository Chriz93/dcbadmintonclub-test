# p37 (September 12, 2026): attendance toggles and one-click "Adjust courts"; the late rule; best of three; ladder gaps.
#  - Attendance tab: every seated player has ✅ Present, ⏰ Late and ❌ Absent toggles (big enough for a thumb). A toggle
#    only records attendance; a bar at the top says how many court changes are waiting and has one "Adjust courts"
#    button for the round about to be played. Players already taken off show under "Marked absent" with "Here after all".
#  - Adjust courts (adjustCourts, a pure function unit-tested on its own) starts from the round's current courts and
#    makes only the moves a valid round needs: absent players leave, returning players go back to their court, late
#    players move down one court, a court of one is never left (the lone player joins the next court in use below; on
#    the bottom court in use, the court above), a court never holds more than five, closed courts seat nobody. Nobody
#    is promoted because someone is missing and nobody else is reshuffled. Courts with scores in the round are locked.
#    When no valid round exists (one player left, more players than the open courts hold, a lone player with nowhere
#    to go) nothing changes and the reason is shown. Never a dropped player, never a court of one or six.
#  - The preview lists every change in plain words, lets the organizer change any move's court (checked again before
#    it can be applied), mark courts unavailable, then Apply (one save, undoable) or Cancel. A second click while it
#    works does nothing; if someone else changed the courts meanwhile the preview is rebuilt; a failed save changes
#    nothing. The last adjustment stays on the tab with its explanation and an Undo button.
#  - Late rule: "Players arriving more than 5 minutes late move down one court" — the Late toggle (applied by Adjust
#    courts) and Session → Late Arrivals (applied at once) both use it. On the bottom court in use a late player stays.
#  - Two players play best of three: once one player has won the first two games there is no Game 3 (not shown, not
#    saved, not required for the round to finish).
#  - A court left empty mid-ladder no longer strands anyone: "up one court" and "down one court" mean the next court in
#    use (rotation, the end-of-session lineup, the projected lineup and the court tags agree).
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)
def line_sub(contains, new):
    global s
    lines = s.split("\n"); hits = [i for i, l in enumerate(lines) if contains in l]
    assert len(hits) == 1, (len(hits), contains[:80])
    lines[hits[0]] = new; s = "\n".join(lines)

# ── Ladder neighbours skip empty courts ──
line_sub("function hasPlayersBelow(c){", """// Ladder neighbours skip empty courts: "one court up/down" is the next court in use, so a court whose players are
// all out never strands a player alone. Pass the lineup being moved (defaults to the live round).
function courtInUse(a,c){return (a[c]||[]).some(id=>S.players.some(p=>p.id===id));}
function courtAbove(c,a){a=a||S.current?.assignments||{};for(let x=c-1;x>=1;x--)if(courtInUse(a,x))return x;return 0;}
function courtBelow(c,a){a=a||S.current?.assignments||{};for(let x=c+1;x<=NC;x++)if(courtInUse(a,x))return x;return 0;}
function hasPlayersBelow(c){return courtBelow(c)>0;}""")
sub("""    const up=c>1?sorted[0]:null,down=hasPlayersBelow(c)?sorted[sorted.length-1]:null;""",
    """    const up=courtAbove(c,a)?sorted[0]:null,down=courtBelow(c,a)?sorted[sorted.length-1]:null;""")
sub("""    let to=from;if(m==='up')to=Math.max(1,from-1);if(m==='down')to=Math.min(NC,from+1);""",
    """    let to=from;if(m==='up')to=courtAbove(from,a)||from;if(m==='down')to=courtBelow(from,a)||from;""")
sub("""    sorted.forEach((id,i)=>{if(i===0&&c>1)finalMv[id]='up';else if(i===sorted.length-1&&hasPlayersBelow(c))finalMv[id]='down';else finalMv[id]='stay';});""",
    """    sorted.forEach((id,i)=>{if(i===0&&courtAbove(c,a))finalMv[id]='up';else if(i===sorted.length-1&&courtBelow(c,a))finalMv[id]='down';else finalMv[id]='stay';});""")
sub("""      const dir=finalMv[id];let to=c;
      if(dir==='up')to=Math.max(1,c-1);
      else if(dir==='down')to=Math.min(NC,c+1);""", """      const dir=finalMv[id];let to=c;
      if(dir==='up')to=courtAbove(c,S.current.assignments)||c;
      else if(dir==='down')to=courtBelow(c,S.current.assignments)||c;""")
sub("""      const dir=lastMv.mv?.[id];
      let to=c;
      if(dir==='up')to=Math.max(1,c-1);
      else if(dir==='down')to=Math.min(NC,c+1);""", """      const dir=lastMv.mv?.[id];
      let to=c;
      if(dir==='up')to=courtAbove(c,ra)||c;
      else if(dir==='down')to=courtBelow(c,ra)||c;""")
sub("""      if(i===0&&c>1)projectedMv[id]='up';
      else if(i===sorted.length-1&&hasPlayersBelow(c))projectedMv[id]='down';""", """      if(i===0&&courtAbove(c,a))projectedMv[id]='up';
      else if(i===sorted.length-1&&courtBelow(c,a))projectedMv[id]='down';""")
sub("""      if(m==='up')to=Math.max(1,from-1);
      if(m==='down')to=Math.min(NC,from+1);""", """      if(m==='up')to=courtAbove(from,a)||from;
      if(m==='down')to=courtBelow(from,a)||from;""")
sub("""const mvDir=i===0&&c>1?'up':i===sorted.length-1&&hasPlayersBelow(c)?'down':'stay';""",
    """const mvDir=i===0&&courtAbove(c)?'up':i===sorted.length-1&&hasPlayersBelow(c)?'down':'stay';""")

# ── Best of three on a court of two ──
sub("""function courtGames(n){return n===5?5:3;}""", """function courtGames(n){return n===5?5:3;}
// Two players play best of three: Game 3 only when the first two games are split. gamesNeeded is what finishes a court.
function bestOfThreeDecided(c,cy){const sc=S.current?.scores||{},g1=sc[`c${c}_y${cy}_g1`],g2=sc[`c${c}_y${cy}_g2`];return !!(g1&&g2&&g1.w===g2.w);}
function gamesNeeded(c,cy){const n=(S.current?.assignments?.[c]||[]).filter(id=>S.players.some(p=>p.id===id)).length;if(n<2)return 0;if(n===2&&bestOfThreeDecided(c,cy??S.current.cycle))return 2;return courtGames(n);}""")
sub("""  if(pids.length<2)return true;
  const numGames=courtGames(pids.length);
  for(let g=1;g<=numGames;g++){if(!S.current.scores[`c${c}_y${cy}_g${g}`])return false;}""", """  if(pids.length<2)return true;
  const numGames=gamesNeeded(c,cy);
  for(let g=1;g<=numGames;g++){if(!S.current.scores[`c${c}_y${cy}_g${g}`])return false;}""")
sub("""    const numGames=courtGames(courtPlayers); // 3-player RR has 3 games too""", """    const numGames=gamesNeeded(c,S.current.cycle); // best of three on a court of two""")
sub("""    totalCourts++;
    const numGames=courtGames(pids.length);""", """    totalCourts++;
    const numGames=gamesNeeded(c,cy);""")
sub("""  // Read scored games for this court/cycle
  const numGames=courtGames(players.length);""", """  // Read scored games for this court/cycle
  const numGames=gamesNeeded(court,cy);""")
sub("""  const maxWins=players.length===5?4:players.length===3?2:3;""", """  const maxWins=players.length===5?4:players.length===3?2:players.length===2?numGames:3;""")
sub("""  combos.forEach(({g,t,ta,tb,md})=>{
    const key=`c${court}_y${cy}_g${g}`,saved=S.current.scores[key];""", """  combos.forEach(({g,t,ta,tb,md})=>{
    const key=`c${court}_y${cy}_g${g}`,saved=S.current.scores[key];
    if(n===2&&g===3&&!saved&&bestOfThreeDecided(court,cy)){const g1=S.current.scores[`c${court}_y${cy}_g1`];html+=`<div class="game-block game-skip" id="skip_${court}_3"><div class="glabel">${t} <span style="font-size:10px;color:var(--muted);font-weight:400;">not needed</span></div><div style="font-size:12px;color:var(--muted);">${esc(g1.w==='A'?ta:tb)} won the first two games — best of three, so there is no Game 3.</div></div>`;return;}""")
sub("""  const combos=buildCombos(players);
  let valid=true;const entries=[];
  combos.forEach(({g,a1,a2,b1,b2})=>{
    const sa=parseInt(document.getElementById(`si_${court}_${g}_a`)?.value);
    const sb=parseInt(document.getElementById(`si_${court}_${g}_b`)?.value);
    if(isNaN(sa)||isNaN(sb)){toast(`Enter all ${combos.length} scores`,'warn');valid=false;return;}""", """  const combos=buildCombos(players);
  let valid=true;const entries=[];
  // Best of three on a court of two: Game 3 only when the first two games are split.
  const val=g=>[parseInt(document.getElementById(`si_${court}_${g}_a`)?.value),parseInt(document.getElementById(`si_${court}_${g}_b`)?.value)];
  const w12=players.length===2?[1,2].map(g=>{const sv=S.current.scores[`c${court}_y${cy}_g${g}`];if(sv)return sv.w;const[x,y]=val(g);return isNaN(x)||isNaN(y)||x===y?null:x>y?'A':'B';}):null;
  const decided=!!(w12&&w12[0]&&w12[0]===w12[1]);
  if(decided){const[x,y]=val(3);if(!isNaN(x)||!isNaN(y))return toast('Best of three: there is no Game 3 once one player has won the first two games. Clear Game 3 and save again.','warn');}
  const needed=decided?combos.filter(x=>x.g!==3):combos;
  needed.forEach(({g,a1,a2,b1,b2})=>{
    const sa=parseInt(document.getElementById(`si_${court}_${g}_a`)?.value);
    const sb=parseInt(document.getElementById(`si_${court}_${g}_b`)?.value);
    if(isNaN(sa)||isNaN(sb)){toast(`Enter all ${needed.length} scores`,'warn');valid=false;return;}""")
sub("""  const combos=buildCombos(players);
  const combo=combos.find(c=>c.g===gameNum);if(!combo){toast('Invalid game','warn');return;}""", """  const combos=buildCombos(players);
  const combo=combos.find(c=>c.g===gameNum);if(!combo){toast('Invalid game','warn');return;}
  if(players.length===2&&gameNum===3&&bestOfThreeDecided(court,cy))return toast('Best of three: there is no Game 3 once one player has won the first two games.','warn');""")

# ── The court adjustment engine (pure) ──
ENGINE = r"""
// ═══ COURT ADJUSTMENT ENGINE — pure (no page state); legacy/tests/unit/adjust.test.mjs loads this block by its markers ═══
// adjustCourts({nc, lineup:{court:[ids]}, absent:[ids], returning:[{id,court}], late:[ids], locked:[courts], closed:[courts], names:{id:name}})
// Starts from the round's courts and makes only the moves a valid round needs. Returns {ok, changed, lineup, removed,
// seated, moves:[{id,from,to,reason}], skippedLate, notes, problem}. When ok is false the lineup is the one passed in.
function adjFormat(n){return n===5?'five doubles games to 15, each player sits out one':n===4?'three doubles games to 21':n===3?'three singles games':n===2?'best of three singles':'not in use';}
function adjSame(x,y){x=x||[];y=y||[];return x.length===y.length&&x.every(id=>y.includes(id));}
function validateLineup(L,o){
  const nc=o.nc||6,probs=[],seen=new Set(),nm=o.nm||(id=>'Player '+id);
  for(let c=1;c<=nc;c++){const ids=L[c]||[],n=ids.length;
    for(const id of ids){if(seen.has(id))probs.push(`${nm(id)} is on two courts.`);seen.add(id);}
    if(o.locked&&o.locked.has(c)&&o.before&&!adjSame(ids,o.before[c]))probs.push(`Court ${c} already has scores this round, so its players can't change.`);
    if(o.closed&&o.closed.has(c)&&n)probs.push(`Court ${c} is marked unavailable but still has players.`);
    if(n===1&&!(o.locked&&o.locked.has(c)))probs.push(`Court ${c} would have one player — a game needs at least two.`);
    if(n>5)probs.push(`Court ${c} would have ${n} players — a court holds at most five.`);}
  if(o.expect)for(const id of o.expect)if(!seen.has(id))probs.push(`${nm(id)} would be left without a court.`);
  for(const id of seen)if(o.absent&&o.absent.has(id)&&!(o.lockedSeat&&o.lockedSeat.has(id)))probs.push(`${nm(id)} is absent but still on a court.`);
  return probs;
}
function adjustCourts(inp){
  const nc=inp.nc||6,MAX=5,nm=id=>(inp.names&&inp.names[id])||('Player '+id);
  const L={},before={};
  {const seen=new Set();for(let c=1;c<=nc;c++){L[c]=(inp.lineup&&inp.lineup[c]||[]).map(Number).filter(id=>seen.has(id)?false:(seen.add(id),true));before[c]=[...L[c]];}}
  const locked=new Set((inp.locked||[]).map(Number)),closed=new Set((inp.closed||[]).map(Number)),absent=new Set((inp.absent||[]).map(Number));
  const moves=[],notes=[],removed=[],seated=[],skippedLate=[],lockedSeat=new Set();
  const where=id=>{for(let c=1;c<=nc;c++)if(L[c].includes(id))return c;return 0;};
  const open=c=>c>=1&&c<=nc&&!locked.has(c)&&!closed.has(c);
  const count=()=>{let n=0;for(let c=1;c<=nc;c++)n+=L[c].length;return n;};
  const fail=problem=>({ok:false,changed:false,problem,lineup:before,moves:[],removed:[],seated:[],skippedLate:[],notes});
  for(const c of closed)if(locked.has(c)&&L[c].length)return fail(`Court ${c} already has scores this round, so it can't be closed now. Finish or clear its games first.`);
  // 1. Absent players leave their court (a court with scores this round keeps its players until the round ends).
  for(const id of absent){const c=where(id);if(!c)continue;
    if(locked.has(c)){lockedSeat.add(id);notes.push(`${nm(id)} is marked absent, but Court ${c} already has scores this round, so ${nm(id)} stays listed there until the round ends.`);continue;}
    L[c]=L[c].filter(x=>x!==id);removed.push({id,from:c});}
  // 2. Players who are back go to their own court when it is open and has room; otherwise they are placed below.
  const displaced=[];
  for(const r of (inp.returning||[])){const id=Number(r.id),to=Number(r.court)||0;if(where(id)||absent.has(id))continue;
    if(open(to)&&L[to].length<MAX){L[to].push(id);seated.push({id,to});}
    else displaced.push({id,from:to>=1&&to<=nc?to:nc+1,why:!(to>=1&&to<=nc)?'back':locked.has(to)?'back-locked':closed.has(to)?'back-closed':'back-full'});}
  // 3. Unavailable courts empty out; 4. a court over five sends its most recent arrivals on.
  for(const c of [...closed].sort((x,y)=>x-y)){for(const id of L[c])displaced.push({id,from:c,why:'closed'});L[c]=[];}
  for(let c=1;c<=nc;c++){if(locked.has(c))continue;const extra=[];while(L[c].length>MAX)extra.unshift(L[c].pop());extra.forEach(id=>displaced.push({id,from:c,why:'full'}));}
  // Capacity: open courts hold five each; courts with scores keep exactly their players.
  const total=count()+displaced.length;let capacity=0;for(let c=1;c<=nc;c++)capacity+=closed.has(c)?0:locked.has(c)?L[c].length:MAX;
  if(total>capacity)return fail(`${total} players need a court, but the available courts hold at most ${capacity}. Mark someone absent, make a court available again, or seat someone out by hand.`);
  if(total===1)return fail(`Only one player is left to play — a game needs at least two. Nothing was changed.`);
  const inUse=c=>L[c].length>0;
  const place=(from,needUse)=>{for(let x=from+1;x<=nc;x++)if(open(x)&&(!needUse||inUse(x))&&L[x].length<MAX)return x;for(let x=Math.min(from,nc+1)-1;x>=1;x--)if(open(x)&&(!needUse||inUse(x))&&L[x].length<MAX)return x;return 0;};
  for(const d of displaced){const to=place(d.from,true)||place(d.from,false);
    if(!to)return fail(`There is no court with room for ${nm(d.id)}. Nothing was changed.`);
    L[to].push(d.id);moves.push({id:d.id,from:d.from<=nc?d.from:0,to,reason:d.why});}
  // 5. Late arrivals move down one court: the next court in use below.
  for(const id of (inp.late||[]).map(Number)){const c=where(id);
    if(!c){skippedLate.push({id,c:0,why:'not-seated'});continue;}
    if(locked.has(c)){skippedLate.push({id,c,why:'locked'});notes.push(`${nm(id)} arrived late, but Court ${c} already has scores this round, so ${nm(id)} stays there.`);continue;}
    let below=0;for(let x=c+1;x<=nc;x++)if(!closed.has(x)&&inUse(x)){below=x;break;}
    const stay=(why,msg)=>{skippedLate.push({id,c,why});notes.push(msg);};
    if(!below){stay('bottom',`${nm(id)} arrived late but is already on the bottom court in use (Court ${c}), so stays there.`);continue;}
    if(locked.has(below)){stay('below-locked',`${nm(id)} arrived late, but Court ${below} already has scores this round, so ${nm(id)} stays on Court ${c}.`);continue;}
    if(L[below].length>=MAX){stay('below-full',`${nm(id)} arrived late, but Court ${below} already has five players, so ${nm(id)} stays on Court ${c}.`);continue;}
    if(L[c].length===2){const other=L[c].find(x=>x!==id);stay('alone',`${nm(id)} arrived late, but moving would leave ${nm(other)} alone on Court ${c}, so ${nm(id)} stays.`);continue;}
    L[c]=L[c].filter(x=>x!==id);L[below].push(id);moves.push({id,from:c,to:below,reason:'late'});}
  // 6. Nobody plays alone: a lone player joins the next court in use below; on the bottom court in use, the one above.
  for(let c=1;c<=nc;c++){if(!open(c)||L[c].length!==1)continue;const id=L[c][0];let to=0,up=false;
    for(let x=c+1;x<=nc;x++)if(open(x)&&inUse(x)&&L[x].length<MAX){to=x;break;}
    if(!to)for(let x=c-1;x>=1;x--)if(open(x)&&inUse(x)&&L[x].length<MAX){to=x;up=true;break;}
    if(!to)return fail(`${nm(id)} would be alone on Court ${c} and no court nearby has room. Nothing was changed.`);
    L[c]=[];L[to].push(id);moves.push({id,from:c,to,reason:up?'alone-up':'alone'});}
  // 7. Check the result: every player who should play has exactly one court, every court is a real game.
  const expect=new Set();for(let c=1;c<=nc;c++)for(const id of before[c])if(!absent.has(id)||lockedSeat.has(id))expect.add(id);for(const s of seated)expect.add(s.id);for(const d of displaced)expect.add(d.id);
  const probs=validateLineup(L,{nc,locked,closed,before,expect,absent,lockedSeat,nm});
  if(probs.length)return fail(probs[0]);
  let changed=false;for(let c=1;c<=nc;c++)if(!adjSame(L[c],before[c]))changed=true;
  for(let c=1;c<=nc;c++)if(L[c].length!==before[c].length&&L[c].length>=2)notes.push(`Court ${c} now has ${L[c].length} players: ${adjFormat(L[c].length)}.`);
  if(!count())notes.push('Nobody is left to play this round.');
  return {ok:true,changed,problem:null,lineup:L,moves,removed,seated,skippedLate,notes};
}
// The plain-words explanation of an adjustment, one line per change, then the notes.
function explainAdjust(res,nm){
  if(!res.ok)return [res.problem];
  const out=[];
  for(const r of res.removed)out.push(`${nm(r.id)} is absent — off Court ${r.from}.`);
  for(const s of res.seated)out.push(`${nm(s.id)} is back — returns to Court ${s.to}.`);
  for(const m of res.moves){const n=nm(m.id);out.push(
    m.reason==='late'?`${n} arrived late — moves down from Court ${m.from} to Court ${m.to}.`:
    m.reason==='alone'?`${n} was the only player left on Court ${m.from}, so joins Court ${m.to} (a game needs at least two).`:
    m.reason==='alone-up'?`${n} was the only player left on Court ${m.from}, the bottom court in use, so joins Court ${m.to} above.`:
    m.reason==='closed'?`Court ${m.from} is unavailable, so ${n} moves to Court ${m.to}.`:
    m.reason==='full'?`Court ${m.from} would have more than five players, so ${n} (the last to join it) moves to Court ${m.to}.`:
    m.reason==='back-full'?`${n} is back, but Court ${m.from} is full, so plays on Court ${m.to}.`:
    m.reason==='back-locked'?`${n} is back, but Court ${m.from} already has scores this round, so plays on Court ${m.to}.`:
    m.reason==='back-closed'?`${n} is back, but Court ${m.from} is unavailable, so plays on Court ${m.to}.`:
    m.reason==='override'?`${n} moves to Court ${m.to} (your choice).`:
    `${n} is back and plays on Court ${m.to}.`);}
  return out.concat(res.notes);
}
function adjCount(res){return res&&res.ok?res.removed.length+res.seated.length+res.moves.length:0;}
// ═══ END COURT ADJUSTMENT ENGINE ═══
"""

UI = r"""
// ── Attendance → Adjust courts (the page side of the engine above) ──
let _adjusting=false,_adjProposal=null;
function courtOfPlayer(id){const a=S.current?.assignments||{};for(let c=1;c<=NC;c++)if((a[c]||[]).includes(id))return c;return 0;}
function adjLocked(){if(!S.current)return[];const cy=S.current.cycle,keys=Object.keys(S.current.scores||{});return [1,2,3,4,5,6].filter(c=>keys.some(k=>k.startsWith(`c${c}_y${cy}_`)));}
function isLateNow(id){const cur=S.current;return !!cur&&(cur.latePlayers||[]).some(l=>l.playerId===id&&(l.pending||l.round===cur.cycle));}
function adjNames(){const o={};S.players.forEach(p=>o[p.id]=p.name);return o;}
function adjInput(){
  const cur=S.current,att=cur.attendance||{},a=cur.assignments||{},seated=new Set(Object.values(a).flat());
  return {nc:NC,lineup:a,names:adjNames(),locked:adjLocked(),closed:[...(cur.closedCourts||[])],
    absent:Object.entries(att).filter(([id,v])=>v==='absent'&&seated.has(+id)).map(([id])=>+id),
    returning:Object.entries(cur.absentFrom||{}).filter(([id])=>att[id]==='present'&&!seated.has(+id)).map(([id,c])=>({id:+id,court:+c})),
    late:(cur.latePlayers||[]).filter(l=>l.pending).map(l=>l.playerId)};
}
function adjustPreview(){if(!S.current||S.current.completed)return null;return adjustCourts(adjInput());}
function adjustWithOverrides(){
  const P=_adjProposal;let res=adjustCourts(P.input);
  if(!res.ok||!Object.keys(P.override).length)return res;
  const L={};for(let c=1;c<=NC;c++)L[c]=[...(res.lineup[c]||[])];const moves=res.moves.map(m=>({...m}));
  for(const [k,v] of Object.entries(P.override)){const id=+k,to=+v,from=Object.keys(L).map(Number).find(c=>L[c].includes(id));if(!from||from===to)continue;
    L[from]=L[from].filter(x=>x!==id);L[to].push(id);const m=moves.find(x=>x.id===id);if(m)m.to=to;else moves.push({id,from,to,reason:'override'});}
  const before={};for(let c=1;c<=NC;c++)before[c]=[...(P.input.lineup[c]||[])];
  const nm=id=>P.input.names[id]||'Player';
  const probs=validateLineup(L,{nc:NC,locked:new Set(P.input.locked),closed:new Set(P.input.closed),before,nm});
  if(probs.length)return {...res,ok:false,problem:'Your change is not a valid round: '+probs[0]};
  const kept=moves.filter(m=>m.from!==m.to);let changed=false;for(let c=1;c<=NC;c++)if(!adjSame(L[c],before[c]))changed=true;
  return {...res,lineup:L,moves:kept,changed};
}
function adjustModalHtml(again){
  const P=_adjProposal,res=adjustWithOverrides(),nm=id=>S.players.find(p=>p.id===id)?.name||'Player';
  const lines=explainAdjust(res,nm),closed=new Set(P.input.closed),locked=new Set(P.input.locked),L=res.ok?res.lineup:P.input.lineup;
  const opts=m=>[1,2,3,4,5,6].filter(c=>!closed.has(c)&&!locked.has(c)).map(c=>`<option value="${c}" ${c===m.to?'selected':''}>Court ${c}</option>`).join('');
  const moved=adjustCourts(P.input).moves;
  return `${again?'<div class="alert alert-warn" role="status">The courts changed while you were looking — this is the updated proposal.</div>':''}
    <div id="adj-explain" aria-live="polite">${res.ok?(lines.length?`<ul class="adj-list">${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:'<p class="adj-none">No changes are needed.</p>'):`<div class="alert alert-error" role="alert">${esc(res.problem)}</div>`}</div>
    ${moved.length?`<div class="adj-over"><div class="lbl">Change a move (optional)</div>${moved.map(m=>`<label class="adj-ov-row"><span>${esc(nm(m.id))}: Court ${m.from||'—'} →</span> <select class="inp adj-ov" data-id="${m.id}" onchange="adjOverride(${m.id},this.value)">${opts({to:+(P.override[m.id]||m.to)})}</select></label>`).join('')}</div>`:''}
    <details class="adj-closed"${closed.size?' open':''}><summary>Courts unavailable tonight</summary><div class="adj-closed-grid">${[1,2,3,4,5,6].map(c=>`<label class="chk-row"><input type="checkbox" id="adj-closed-${c}" ${closed.has(c)?'checked':''} ${locked.has(c)?'disabled':''} onchange="adjToggleClosed(${c},this.checked)"> Court ${c}${locked.has(c)?' (has scores)':''}</label>`).join('')}</div></details>
    <div class="adj-sizes">${[1,2,3,4,5,6].map(c=>{const n=(L[c]||[]).length;return `<span class="tag ${n?'tg-teal':'tg-gray'}">C${c}: ${n}${locked.has(c)?' 🔒':''}${closed.has(c)?' ✕':''}</span>`;}).join(' ')}</div>
    <div class="adj-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="adj-apply" onclick="applyCourtAdjust()" ${res.ok&&res.changed?'':'disabled'}>✓ Apply changes</button></div>`;
}
function adjRefreshModal(){if(_adjProposal)document.getElementById('modal-body').innerHTML=adjustModalHtml(false);}
function adjOverride(id,to){if(!_adjProposal)return;_adjProposal.override[id]=+to;adjRefreshModal();}
function adjToggleClosed(c,on){if(!_adjProposal)return;const s=new Set(_adjProposal.input.closed);on?s.add(c):s.delete(c);_adjProposal.input.closed=[...s].sort((x,y)=>x-y);_adjProposal.override={};adjRefreshModal();}
async function previewAdjust(again){
  if(!adminUnlocked)return toast('Organizer verification required','warn');
  if(_adjusting)return;
  if(!S.current)return toast('Start the session first — the starting lineup seats present players by their earned court.','warn');
  if(S.current.completed)return toast('Both rounds are finished — nothing left to adjust.','info');
  _adjusting=true;const btn=document.getElementById('adj-btn');if(btn){btn.disabled=true;btn.textContent='Checking…';}
  try{
    if(!(await loadAll()))throw new Error('Could not load the latest courts — check the connection and try again');
    if(!S.current||S.current.completed)return toast('The session changed — nothing to adjust now.','info');
    const input=adjInput();_adjProposal={version:_stateVersion['current_session'],round:S.current.cycle,input,override:{}};
    const res=adjustCourts(input);
    if(res.ok&&!res.changed&&!res.notes.length&&!input.closed.length){_adjProposal=null;return toast('Courts already match attendance — nothing to change','info');}
    openModal(`Adjust courts — Round ${S.current.cycle}`,adjustModalHtml(again));
  }catch(e){toast(e.message||'Could not check the courts','error');}
  finally{_adjusting=false;renderAttendanceTab();}
}
async function applyCourtAdjust(){
  const P=_adjProposal;if(!P||_adjusting)return;
  const res=adjustWithOverrides();
  if(!res.ok)return toast(res.problem,'warn');
  if(!res.changed&&adjSame(P.input.closed,S.current?.closedCourts||[]))return toast('Nothing to change','info');
  _adjusting=true;const b=document.getElementById('adj-apply');if(b){b.disabled=true;b.textContent='Applying…';}
  try{
    if(!S.current||_stateVersion['current_session']!==P.version||S.current.cycle!==P.round){_adjusting=false;closeModal();return previewAdjust(true);}
    const cur=S.current,cy=cur.cycle,nm=id=>S.players.find(p=>p.id===id)?.name||'Player';
    cur.assignments=res.lineup;cur.closedCourts=[...P.input.closed];
    for(const id of [...res.seated.map(x=>x.id),...res.moves.filter(m=>/^back/.test(m.reason)).map(m=>m.id)])if(cur.absentFrom)delete cur.absentFrom[id];
    for(const l of (cur.latePlayers||[])){if(!l.pending)continue;const m=res.moves.find(x=>x.id===l.playerId),sk=res.skippedLate.find(x=>x.id===l.playerId);
      if(m){l.to=m.to;l.pending=false;l.round=cy;}else if(sk){l.to=sk.c||l.originalCourt;l.pending=false;l.round=cy;l.stayed=sk.why;}}
    const lines=explainAdjust(res,nm);
    cur.adjustments=[...(cur.adjustments||[]),{at:new Date().toISOString(),round:cy,by:myEmail()||'',lines}].slice(-20);
    await setKV('current_session',cur);
    closeModal();_adjProposal=null;
    await loadAll();renderAll();
    const n=adjCount(res);toast(`Courts adjusted for Round ${cy} — ${n} change${n===1?'':'s'}. Undo is on the Attendance tab.`,'success');
  }catch(e){if(!(e.code==='40001'||/Stale state/.test(e.message||'')))toast('Courts not changed: '+(e.message||'check the connection')+'. Try again.','error');closeModal();_adjProposal=null;await loadAll();renderAll();}
  finally{_adjusting=false;}
}
function renderAdjustBar(){
  if(!S.current)return `<div class="adj-bar" id="adj-bar"><div class="adj-sum">Courts are set when the session starts: present players sit by their earned court. After that, mark attendance here and press <strong>Adjust courts</strong>.</div></div>`;
  if(S.current.completed)return `<div class="adj-bar" id="adj-bar"><div class="adj-sum">Both rounds are finished — nothing left to adjust.</div></div>`;
  const res=adjustPreview(),n=adjCount(res),cy=S.current.cycle,lk=adjLocked().length;
  const sum=res&&!res.ok?`⚠️ ${esc(res.problem)}`:n?`<strong>${n} court change${n===1?'':'s'} waiting</strong> for Round ${cy}`:`✓ Courts match attendance for Round ${cy}`;
  return `<div class="adj-bar${n||(res&&!res.ok)?' adj-pending':''}" id="adj-bar" role="region" aria-label="Adjust courts">
    <div class="adj-sum" id="adj-sum">${sum}${lk?`<div class="adj-lock">🔒 ${lk} court${lk===1?' has':'s have'} scores this round and stay${lk===1?'s':''} as ${lk===1?'it is':'they are'}.</div>`:''}</div>
    <label class="adj-lbl" for="adj-round">Round</label>
    <select id="adj-round" class="inp adj-sel" aria-label="Round to adjust"><option value="${cy}">Round ${cy} — next to play</option></select>
    <button class="btn btn-primary adj-btn" id="adj-btn" onclick="previewAdjust()" ${_adjusting?'disabled':''}>🔁 Adjust courts</button></div>`;
}
function renderLastAdjustment(){
  const last=(S.current?.adjustments||[]).slice(-1)[0];if(!last)return '';
  const t=new Date(last.at).toLocaleTimeString('en-CA',{hour:'numeric',minute:'2-digit'});
  const undoable=S.undoTop&&S.undoTop.label===`Adjust courts (Round ${last.round})`;
  return `<div class="card" id="adj-last"><div class="card-title">🔁 Last court adjustment</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Round ${last.round} · ${esc(t)}</div>
    <ul class="adj-list">${(last.lines||[]).map(l=>`<li>${esc(l)}</li>`).join('')}</ul>
    ${undoable?`<button class="btn btn-ghost" id="adj-undo" onclick="undoLast()">↶ Undo this adjustment</button>`:''}</div>`;
}
"""

sub("""// ══════════════════════════════════════════════
// ATTENDANCE
""", ENGINE + UI + """
// ══════════════════════════════════════════════
// ATTENDANCE
""")

# ── Attendance tab: toggles, the Adjust bar, "Marked absent", the last adjustment ──
sub("""  let html=`<div class="card"><div class="card-title">📋 Session ${sessionNum} Attendance</div>""",
    """  let html=renderAdjustBar()+`<div class="card"><div class="card-title">📋 Session ${sessionNum} Attendance</div>""")
sub("""      html+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="flex:1;font-size:12px;font-weight:700;">${esc(p.name.split(' ')[0])} ${voteTag}</span>
        <button class="btn btn-sm ${status==='present'?'btn-success':'btn-ghost'}" style="padding:3px 8px;font-size:10px;margin:0;" onclick="markAttForTab(${id},'present')">✅</button>
        <button class="btn btn-sm ${status==='absent'?'btn-danger':'btn-ghost'}" style="padding:3px 8px;font-size:10px;margin:0;" onclick="markAttForTab(${id},'absent',${c})">❌</button>
      </div>`;""", """      const late=isLateNow(id),here=status==='present'&&!late;
      html+=`<div class="att-line${status==='absent'?' att-out':''}" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);">
        <span style="flex:1 1 120px;font-size:12px;font-weight:700;">${esc(p.name.split(' ')[0])} ${voteTag}</span>
        <button class="btn btn-sm att-tg ${here?'btn-success':'btn-ghost'}" aria-pressed="${here}" title="Mark ${esc(p.name)} present" style="margin:0;" onclick="markAttForTab(${id},'present',${c})">✅ <span class="att-tl">Present</span></button>
        ${S.current&&!S.current.completed?`<button class="btn btn-sm att-tg ${late?'btn-warn':'btn-ghost'}" aria-pressed="${late}" title="Mark ${esc(p.name)} late (more than 5 minutes)" style="margin:0;" onclick="markAttForTab(${id},'late',${c})">⏰ <span class="att-tl">Late</span></button>`:''}
        <button class="btn btn-sm att-tg ${status==='absent'?'btn-danger':'btn-ghost'}" aria-pressed="${status==='absent'}" title="Mark ${esc(p.name)} absent" style="margin:0;" onclick="markAttForTab(${id},'absent',${c})">❌ <span class="att-tl">Absent</span></button>
      </div>`;""")
sub("""    html+=`</div>`;
  }
  html+=`</div>`;
  // Spare pool""", """    html+=`</div>`;
  }
  // Players already taken off a court tonight: one tap brings them back (Adjust courts seats them on their own court).
  if(S.current){const out=Object.entries(att).filter(([id,v])=>v==='absent'&&!courtPlayerIds.has(+id)).map(([id])=>S.players.find(p=>p.id===+id)).filter(Boolean);
    if(out.length)html+=`<div class="att-out-list" id="att-out"><div class="lbl" style="margin-top:8px;">Marked absent (off the courts)</div>${out.map(p=>`<div class="att-line" style="display:flex;align-items:center;gap:6px;padding:4px 0;"><span style="flex:1;font-size:12px;font-weight:700;">${esc(p.name)}</span><button class="btn btn-sm att-tg btn-ghost" style="margin:0;" title="${esc(p.name)} is here after all" onclick="markAttForTab(${p.id},'present')">✅ <span class="att-tl">Here after all</span></button></div>`).join('')}</div>`;}
  html+=`</div>`;
  html+=renderLastAdjustment();
  // Spare pool""")
sub("""async function markAttForTab(id,status,court){
  // Mark attendance
  if(S.current){
    if(!S.current.attendance)S.current.attendance={};
    S.current.attendance[id]=status;
  }else{
    if(!S.preAttendance)S.preAttendance={};
    S.preAttendance[id]=status;
  }
  // If absent — auto-remove from court
  if(status==='absent'&&court&&S.current){
    S.current.assignments[court]=(S.current.assignments[court]||[]).filter(pid=>pid!==id);
    if(!S.current.absentFrom)S.current.absentFrom={};S.current.absentFrom[id]=court; // remembered for the demotion at session end
  }
  // Save immediately (no debounce — attendance is critical), then confirm
  if(S.current)await setKV('current_session',S.current);
  else await setKV('pre_session_attendance',S.preAttendance||{});
  const first=S.players.find(p=>p.id===id)?.name.split(' ')[0];
  if(status==='absent'&&court)toast(first+' marked absent — off Court '+court+' tonight, one court down next week','warn');
  else if(status==='present')toast(first+' confirmed present','success');
  await loadAll();renderAttendanceTab();renderCourts();renderAdminPlayers();
}""", """// A toggle records attendance only; Adjust courts moves players. Late counts as present (a late player played).
async function markAttForTab(id,status,court){
  const first=S.players.find(p=>p.id===id)?.name.split(' ')[0]||'Player';
  if(S.current){
    const cur=S.current,cy=cur.cycle;
    if(!cur.attendance)cur.attendance={};
    if(!cur.latePlayers)cur.latePlayers=[];
    if(status==='late'){
      if(cur.latePlayers.some(l=>l.playerId===id&&(l.pending||l.round===cy)))return toast(`${first} is already marked late this round`,'info');
      cur.attendance[id]='present';
      cur.latePlayers.push({playerId:id,originalCourt:courtOfPlayer(id)||court||0,round:cy,pending:true});
    }else{
      cur.latePlayers=cur.latePlayers.filter(l=>!(l.playerId===id&&l.pending));
      cur.attendance[id]=status;
      if(status==='absent'){if(!cur.absentFrom)cur.absentFrom={};cur.absentFrom[id]=courtOfPlayer(id)||court||cur.absentFrom[id]||NC;} // remembered for the demotion at session end
    }
  }else{
    if(status==='late')status='present';
    if(!S.preAttendance)S.preAttendance={};
    S.preAttendance[id]=status;
  }
  // Save immediately (no debounce — attendance is critical), then confirm
  if(S.current)await setKV('current_session',S.current);
  else await setKV('pre_session_attendance',S.preAttendance||{});
  const res=S.current?adjustPreview():null,tail=res&&adjCount(res)?' — press Adjust courts to update the courts':'';
  if(status==='absent'&&court&&!S.current)toast(first+' marked absent — off Court '+court+' tonight, one court down next week','warn');
  else if(status==='absent')toast(`${first} marked absent${tail}. One court down next week.`,'warn');
  else if(status==='late')toast(`${first} marked late${tail}`,'warn');
  else if(status==='present')toast(first+' confirmed present'+tail,'success');
  await loadAll();renderAttendanceTab();renderCourts();renderAdminPlayers();
}""")

# ── Session → Late Arrivals: the same rule, applied at once ──
sub("""async function markPlayerLate(){
  if(!S.current)return toast('No session','warn');
  const pid=parseInt(document.getElementById('late-player-sel')?.value);
  if(!pid)return toast('Select a player','warn');
  if(!S.current.latePlayers)S.current.latePlayers=[];
  const lat=S.current.latePlayers;
  if(lat.find(x=>x.playerId===pid))return toast('Already marked late','warn');
  let originalCourt=null;
  for(let c=1;c<=NC;c++){
    if((S.current.assignments[c]||[]).includes(pid)){originalCourt=c;break;}
  }
  if(!originalCourt)return toast('Player not assigned','warn');
  if(originalCourt!==NC&&(S.current.assignments[NC]||[]).length>=courtCap(NC))return toast(`Court ${NC} already has ${courtCap(NC)} players — use Remove Absent & Replace or Rebalance instead`,'warn');
  const lastCourt=NC;
  const a=S.current.assignments;
  for(let c=1;c<=NC;c++)a[c]=(a[c]||[]).filter(id=>id!==pid);
  if(!a[lastCourt])a[lastCourt]=[];
  a[lastCourt].push(pid);
  lat.push({playerId:pid,originalCourt});
  await setKV('current_session',S.current);
  await loadAll();renderAll();toast('Player marked late','success');
}""", """// "Players arriving more than 5 minutes late move down one court" — applied at once, through the adjustment engine,
// so court sizes stay valid. On the bottom court in use the player stays.
async function markPlayerLate(){
  if(!S.current)return toast('No session','warn');
  const pid=parseInt(document.getElementById('late-player-sel')?.value);
  if(!pid)return toast('Select a player','warn');
  if(!S.current.latePlayers)S.current.latePlayers=[];
  const cy=S.current.cycle,lat=S.current.latePlayers;
  if(lat.find(x=>x.playerId===pid&&(x.round==null||x.round===cy||x.pending)))return toast('Already marked late','warn');
  const originalCourt=courtOfPlayer(pid);
  if(!originalCourt)return toast('Player not assigned','warn');
  const inp={...adjInput(),absent:[],returning:[],late:[pid]},res=adjustCourts(inp),nm=id=>S.players.find(p=>p.id===id)?.name||'Player';
  if(!res.ok)return toast(res.problem,'warn');
  const mv=res.moves.find(m=>m.id===pid&&m.reason==='late'),sk=res.skippedLate.find(x=>x.id===pid);
  if(!S.current.attendance)S.current.attendance={};S.current.attendance[pid]='present';
  lat.push({playerId:pid,originalCourt,round:cy,to:mv?mv.to:originalCourt,pending:false,...(sk?{stayed:sk.why}:{})});
  if(res.changed)S.current.assignments=res.lineup;
  await setKV('current_session',S.current);
  await loadAll();renderAll();
  toast(explainAdjust(res,nm).find(l=>l.startsWith(nm(pid)))||`${nm(pid)} marked late`,mv?'success':'info');
}""")
sub("""          <span>⏰ ${p?esc(p.name):'Unknown'} (was C${lp.originalCourt})</span>""",
    """          <span>⏰ ${p?esc(p.name):'Unknown'} (was C${lp.originalCourt}${lp.pending?' · move waiting for Adjust courts':lp.to&&lp.to!==lp.originalCourt?` → C${lp.to}`:' · stayed'})</span>""")
sub("""    <div class="card"><div class="card-title">⏰ Late Arrivals</div>
      <div style="margin-bottom:10px;">""", """    <div class="card"><div class="card-title">⏰ Late Arrivals</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Players arriving more than 5 minutes late move down one court, starting now. On the bottom court in use they stay. Courts with scores this round don't change.</div>
      <div style="margin-bottom:10px;">""")

# ── Undo labels ──
sub("""const UNDOABLE={""", """const UNDOABLE={"applyCourtAdjust":"Adjust courts",""")
if '"markPlayerLate"' not in s.split("const UNDOABLE={")[1].split("\n")[0]:
    sub("""const UNDOABLE={"applyCourtAdjust":"Adjust courts",""", """const UNDOABLE={"applyCourtAdjust":"Adjust courts","markPlayerLate":"Mark late",""")
sub("""    case 'markAttForTab':return `Mark ${pn(args[0])} ${args[1]}`;""", """    case 'markAttForTab':return `Mark ${pn(args[0])} ${args[1]}`;
    case 'applyCourtAdjust':return `Adjust courts (Round ${S.current?.cycle||1})`;
    case 'markPlayerLate':{const v=parseInt(document.getElementById('late-player-sel')?.value);return `Mark ${pn(v)} late`;}""")

# ── Styles for the bar, toggles and the preview ──
sub("""/* ALERTS */""", """/* ATTENDANCE: toggles and the Adjust courts bar */
.adj-bar{position:sticky;top:62px;z-index:60;display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;background:var(--s1);border:1px solid var(--border);border-radius:14px;padding:10px 12px;margin-bottom:12px;box-shadow:0 6px 18px rgba(15,31,22,0.08);}
.adj-bar.adj-pending{border-color:var(--teal);box-shadow:0 0 0 2px rgba(21,128,61,0.18),0 6px 18px rgba(15,31,22,0.08);}
.adj-sum{flex:1 1 220px;font-size:13px;line-height:1.4;}
.adj-lock{font-size:12px;color:var(--muted);margin-top:2px;}
.adj-lbl{font-size:12px;color:var(--muted);font-weight:700;}
.adj-sel{width:auto;margin:0;padding:9px 10px;font-size:14px;}
.adj-btn{width:auto;margin:0;min-height:44px;}
.att-tg{min-height:40px;padding:6px 10px;font-size:12px;margin:0;}
@media (pointer:coarse){.att-tg{min-height:44px;min-width:44px;}}
.att-out>span:first-child{text-decoration:line-through;color:var(--muted);}
.adj-list{margin:0 0 10px;padding-left:18px;font-size:13px;line-height:1.5;display:grid;gap:4px;}
.adj-over{margin:8px 0;display:grid;gap:6px;}
.adj-ov-row{display:flex;align-items:center;gap:8px;font-size:13px;flex-wrap:wrap;}
.adj-ov{width:auto;margin:0;padding:8px 10px;}
.adj-closed{margin:8px 0;font-size:13px;}
.adj-closed summary{cursor:pointer;font-weight:700;padding:6px 0;}
.adj-closed-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;}
.adj-sizes{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0;}
.adj-actions{display:flex;gap:8px;}
.adj-actions .btn{flex:1;}
.game-skip{opacity:0.85;}

/* ALERTS */""")
f.write_text(s)
print("p37 applied")
