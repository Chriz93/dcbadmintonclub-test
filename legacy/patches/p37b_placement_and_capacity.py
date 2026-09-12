# p37b (September 12, 2026): two corrections to the attendance adjustment.
#  - Placing players who must move (an unavailable court, a full court, a player back to a court that can't take them):
#    the nearest court in use below with room; if there is none, a free court below when another of the players who
#    must move can join them there (so a group from an unavailable court keeps playing together on the next free
#    court); otherwise the nearest court in use above with room; last, any free court. Before, the last player could
#    be left alone on a free court and the whole adjustment refused although a valid round existed.
#  - Start Session refuses more players than six courts seat (30) instead of putting the extras on Court 6.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""  const place=(from,needUse)=>{for(let x=from+1;x<=nc;x++)if(open(x)&&(!needUse||inUse(x))&&L[x].length<MAX)return x;for(let x=Math.min(from,nc+1)-1;x>=1;x--)if(open(x)&&(!needUse||inUse(x))&&L[x].length<MAX)return x;return 0;};
  for(const d of displaced){const to=place(d.from,true)||place(d.from,false);
    if(!to)return fail(`There is no court with room for ${nm(d.id)}. Nothing was changed.`);
    L[to].push(d.id);moves.push({id:d.id,from:d.from<=nc?d.from:0,to,reason:d.why});}""",
"""  // Placing a player who must move: the nearest court in use below with room; if none, a free court below when another
  // player still to place can join them there; otherwise the nearest court in use above with room; last, any free court.
  const below=(from,ok)=>{for(let x=from+1;x<=nc;x++)if(ok(x))return x;return 0;},above=(from,ok)=>{for(let x=Math.min(from,nc+1)-1;x>=1;x--)if(ok(x))return x;return 0;};
  const room=x=>open(x)&&inUse(x)&&L[x].length<MAX,free=x=>open(x)&&!inUse(x);
  for(let i=0;i<displaced.length;i++){const d=displaced[i];
    let to=below(d.from,room);
    if(!to&&displaced.length-i>=2)to=below(d.from,free);
    if(!to)to=above(d.from,room);
    if(!to)to=below(d.from,free)||above(d.from,free);
    if(!to)return fail(`There is no court with room for ${nm(d.id)}. Nothing was changed.`);
    L[to].push(d.id);moves.push({id:d.id,from:d.from<=nc?d.from:0,to,reason:d.why});}""")
sub("""    if(!to)return fail(`${nm(id)} would be alone on Court ${c} and no court nearby has room. Nothing was changed.`);""",
    """    if(!to)return fail(`${nm(id)} would be alone on Court ${c} and no court nearby has room. Nothing was changed — seat them by hand in Session → Assign.`);""")
sub("""function autoAssign(exclude=new Set(),spares=[]){""", """// More players than six courts seat (five each) is not a valid night: say so instead of overfilling a court.
function seatingProblem(n){return n>NC*5?`${n} players are coming, but the ${NC} courts seat at most ${NC*5}. Mark someone absent or not coming, then start the session.`:'';}
function autoAssign(exclude=new Set(),spares=[]){""")
sub("""  const{votes,pre,declined,preAbsent,confirmedSpares,assign:initAssign}=upcomingLineup();""",
    """  const{votes,pre,declined,preAbsent,confirmedSpares,assign:initAssign}=upcomingLineup();
  {const why=seatingProblem(Object.values(initAssign).flat().length);if(why)return toast(why,'error');}""")
f.write_text(s)
print("p37b applied")
