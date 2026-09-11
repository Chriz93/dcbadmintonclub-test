# p33 (September 11, 2026): the app does the coin toss.
#  - Players still tied on wins, points and point difference at the top of a court (who moves up) or the bottom (who
#    moves down) are decided by a coin toss the app draws itself (tossOrder). The draw is seeded by the night's start
#    time, the round, the court and the tied players: every phone shows the same result as soon as the court is
#    finished, nobody can know it before the night starts, and Undo followed by advancing again cannot redraw it.
#  - Before, an unrecorded tie was silently decided by head-to-head, then player number (not the written rule), unless
#    the admin opened "Record Toss — Who Won?" and picked a player by hand. That popup and its Redo are gone.
#  - One ranking everywhere: the rotation, the court tally, the projected moves and End Session all use
#    sortCourtRanking. Each toss that decided a move is recorded in the round's movements (History shows "🪙 Toss used").
#  - When a whole court is tied, the same toss order decides both who moves up and who moves down (the tally used to
#    say "stays" while the rotation still moved someone down).
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)
def between(start, end, new):
    """Replace from the (unique) start text through the first end text after it."""
    global s
    assert s.count(start) == 1, ("start", start[:90])
    i = s.index(start); j = s.index(end, i) + len(end)
    s = s[:i] + new + s[j:]
def cut_block(marker, end):
    """Remove from the line before the (unique) marker line through the first end text after it."""
    global s
    assert s.count(marker) == 1, ("marker", marker[:90])
    m = s.index(marker); i = s.rfind("\n", 0, m - 1) + 1; j = s.index(end, m) + len(end)
    s = s[:i] + s[j:]

# 1. The toss itself (replaces the hidden head-to-head tiebreak).
between("// Deterministic tie-break inside a court: head-to-head games won between the tied players,\n",
        "  return[...ids].sort((x,y)=>h2h[y]-h2h[x]||(ptAgainst[x]||0)-(ptAgainst[y]||0)||x-y);\n}\n",
        """// The coin toss for players still tied on wins, points and point difference: the app draws it. The draw is seeded by
// this night's start time, the round, the court and the tied players, so every phone shows the same result, nobody can
// know it before the night starts, and Undo cannot redraw it. Returns the tied players in toss order (first wins).
function tossOrder(ids,cy,c){
  const g=[...ids].sort((x,y)=>x-y);let h=2166136261;
  for(const ch of `${S.current?.id||0}|${cy}|${c}|${g.join(',')}`){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  let a=h|0;const rnd=()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  for(let i=g.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[g[i],g[j]]=[g[j],g[i]];}
  return g;
}
""")

# 2. The rotation ranks each court with the shared ranking and records the tosses that decided a move.
between("  // Detect ties (by WINS first, then points as secondary) and resolve via toss before sorting.\n",
        "    sorted.forEach((id,i)=>{if(i===0&&c>1)mv[id]='up';else if(i===sorted.length-1&&hasPlayersBelow(c))mv[id]='down';else mv[id]='stay';});\n  }\n",
        """  // Each court ranks its players with sortCourtRanking (wins, points, point difference, then the app's coin toss).
  // The first moves up, the last moves down into a court that has players; every toss that decided a move is recorded.
  const tossResults={},tossChoices={};
  const key=id=>[wins[id]||0,pts[id]||0,(ptFor[id]||0)-(ptAgainst[id]||0)].join('/');
  const mv={},na={};for(let c=1;c<=NC;c++)na[c]=[];
  for(let c=1;c<=NC;c++){
    const pids=a[c]||[];if(pids.length<2){pids.forEach(id=>mv[id]='stay');continue;}
    const sorted=sortCourtRanking(pids,wins,pts,ptFor,ptAgainst,cy,c,S.current.preTosses);
    const up=c>1?sorted[0]:null,down=hasPlayersBelow(c)?sorted[sorted.length-1]:null;
    const topG=pids.filter(id=>key(id)===key(sorted[0])).sort((x,y)=>x-y),botG=pids.filter(id=>key(id)===key(sorted[sorted.length-1])).sort((x,y)=>x-y);
    if(up!=null&&topG.length>1){tossChoices['top_'+c]={group:topG,direction:'up',winnerId:up,by:'app'};tossResults['top_'+c]=up;}
    if(down!=null&&botG.length>1){tossChoices['bot_'+c]={group:botG,direction:'down',loserId:down,by:'app'};tossResults['bot_'+c]=down;}
    sorted.forEach(id=>{mv[id]=id===up?'up':id===down?'down':'stay';});
  }
""")

# 3. The shared ranking: wins, points, point difference, then the toss at the top and at the bottom.
between("function sortCourtRanking(pids,wins,pts,ptFor,ptAgainst,cy,c,preTosses){\n", "  return sorted;\n}\n",
        """function sortCourtRanking(pids,wins,pts,ptFor,ptAgainst,cy,c,preTosses){
  const key=id=>[wins[id]||0,pts[id]||0,(ptFor[id]||0)-(ptAgainst[id]||0)];
  const same=(x,y)=>{const p=key(x),q=key(y);return p[0]===q[0]&&p[1]===q[1]&&p[2]===q[2];};
  const sorted=[...pids].sort((x,y)=>{const p=key(x),q=key(y);return q[0]-p[0]||q[1]-p[1]||q[2]-p[2]||x-y;});
  if(sorted.length<2)return sorted;
  // Still tied on wins, points and point difference at the top or the bottom: the app's coin toss decides (tossOrder).
  // A toss recorded by hand in an older session (preTosses) is kept.
  const pT=preTosses||{},topT=pT[`${cy}_c${c}_top`],botT=pT[`${cy}_c${c}_bot`];
  const topG=sorted.filter(id=>same(id,sorted[0])),botG=sorted.filter(id=>same(id,sorted[sorted.length-1]));
  if(topG.length>1){const w=topT&&topG.includes(topT.winnerId)?topT.winnerId:tossOrder(topG,cy,c)[0];sorted.splice(sorted.indexOf(w),1);sorted.unshift(w);}
  if(botG.length>1){const l=botT&&botG.includes(botT.loserId)&&botT.loserId!==sorted[0]?botT.loserId:tossOrder(botG,cy,c).filter(id=>id!==sorted[0]).slice(-1)[0];sorted.splice(sorted.indexOf(l),1);sorted.push(l);}
  return sorted;
}
""")

# 4. The court tally shows the toss result once the court is finished; nothing to record by hand.
sub("  // Populate the tally card (shows the Record Toss button if a tie exists)\n",
    "  // Populate the tally card (movement tags, and the app's coin toss when players are still tied)\n")
sub("""// COURT TALLY — standalone renderer, can be called any time after scores
// are saved. Reads scores + preTosses from S.current and writes the tally
// card into #res-${court}. Shows a "🪙 Record Toss Result" button when a
// tie is detected and no toss has been recorded yet; shows the resolved
// movement (with a 🪙 badge) once admin has recorded the toss decision.
""", """// COURT TALLY — standalone renderer, can be called any time after scores
// are saved. Writes the tally card into #res-${court}: each player's
// movement and, once the court is finished, the app's coin toss for
// players still tied on wins, points and point difference (tossOrder).
""")
between("  const maxWins=players.length===5?4:players.length===3?2:3;   // on a court of five each player plays four of the five games\n",
        "  el.innerHTML=tallyHtml;\n}\n",
        """  const maxWins=players.length===5?4:players.length===3?2:3;   // on a court of five each player plays four of the five games
  const done=gamesScored===numGames,last=sorted.length-1;
  const key=id=>[wins[id]||0,pts[id]||0,(ptFor[id]||0)-(ptAgainst[id]||0)].join('/');
  // Tied on wins, points and point difference with the top (or bottom) player: the app's coin toss decides who moves.
  const topTied=p=>key(p.id)===key(sorted[0].id),botTied=p=>key(p.id)===key(sorted[last].id);
  const hasTopTie=court>1&&players.filter(topTied).length>1;
  const hasBotTie=hasPlayersBelow(court)&&players.filter(botTied).length>1;
  const tag=(cls,txt)=>`<span class="tag ${cls}" style="margin-left:4px;font-size:11px;">${txt}</span>`;
  const tallyHtml=`<div class="card" style="border-color:var(--teal2);"><div class="card-title">✅ Court ${court} Tally${players.length<4?' (Singles)':''}</div>
    ${sorted.map((p,i)=>{
      const pw=wins[p.id];
      const movementTag=(()=>{
        if(i===0&&court===1)return tag('tg-gold','👑 Top court');
        if(hasTopTie&&topTied(p)&&!(hasBotTie&&i===last)){
          if(!done)return tag('tg-yellow','🪙 Toss for ↑ C'+(court-1));
          return i===0?tag('tg-green','🪙 Won toss — ⬆️ C'+(court-1)):tag('tg-teal','🪙 Lost toss — Stays C'+court);
        }
        if(i===0&&court>1)return tag('tg-green','⬆️ Moves to C'+(court-1));
        if(hasBotTie&&botTied(p)){
          if(!done)return tag('tg-yellow','🪙 Toss for ↓ C'+(court+1));
          return i===last?tag('tg-red','🪙 Lost toss — ⬇️ C'+(court+1)):tag('tg-teal','🪙 Won toss — Stays C'+court);
        }
        if(i===last&&!hasPlayersBelow(court))return tag('tg-gray','📍 Bottom court');
        if(i===last)return tag('tg-red','⬇️ Moves to C'+(court+1));
        return tag('tg-teal','Stays C'+court);
      })();
      return `<div class="lbrow"><div class="lbrank ${i===0?'r1':''}">${i+1}</div>
        <div class="lbinfo"><div class="lbname">${esc(p.name)}</div></div>
        <span class="tag ${pw===maxWins?'tg-green':pw===0?'tg-red':'tg-teal'}">${pw}W · ${maxWins-pw}L</span>
        ${movementTag}
      </div>`;
    }).join('')}
    ${done&&(hasTopTie||hasBotTie)?`<div style="margin-top:8px;padding:6px 8px;background:rgba(241,196,15,0.12);border:1px solid var(--yellow2);border-radius:6px;font-size:11px;">🪙 Coin toss by the app (tied on wins, points and point difference): ${[hasTopTie?`<strong>${esc(sorted[0].name)}</strong> moves up`:'',hasBotTie?`<strong>${esc(sorted[last].name)}</strong> moves down`:''].filter(Boolean).join(' · ')}. Every phone shows the same result.</div>`:''}
  </div>`;
  el.innerHTML=tallyHtml;
}
""")

# 5. The hand-recorded toss (button, popup, Redo) is gone.
cut_block("// Record a toss decision for a specific court's top or bottom tie.\n", "  toast('Toss cleared — record again','warn');\n}\n\n")
cut_block("// TOSS MODAL — returns a Promise that resolves with the chosen player ID.\n",
          "    if(cancelBtn)cancelBtn.addEventListener('click',()=>cleanupAndResolve(null));\n  });\n}\n\n")
sub("toast('Round advance already in progress — finish the toss prompt first','warn')", "toast('Round advance already in progress','warn')")
sub("toast('Round is advancing — resolve the toss prompt before saving new scores','warn')", "toast('Round is advancing — save again in a moment','warn')", 2)

sub(',"recordCourtToss":"Record toss"', '')   # no longer an admin step, so nothing for Undo to wrap

# 6. The written rules say who tosses.
sub("ties go to points, then point difference, then a coin toss.",
    "ties go to points, then point difference, then a coin toss that the app does by itself (the same result on every phone).")
sub("(ties: points, then point difference, then a coin toss)", "(ties: points, then point difference, then a coin toss done by the app)")

for gone in ("tieOrder(", "tossPrompt", "recordCourtToss", "clearCourtToss", "Record Toss"):
    assert gone not in s, gone
f.write_text(s)
print("p33 applied")
