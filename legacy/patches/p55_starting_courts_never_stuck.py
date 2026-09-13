# p55 (September 13, 2026): tonight's starting courts always give a valid night when 2 to 30 players are coming.
#  - Before: a player left alone on a court when every other court in use already had five could not be settled, so
#    Start Session was refused and told the organizer to "seat them by hand in Session → Assign" — which does not exist
#    before the session starts (found by the generated interop tests: Court 1 with one player after a decline, Court 2
#    with five). The organizer could not start a valid six-player night.
#  - Now, for the starting courts only (no scores yet), the nearest court in use sends one player to play with them: on
#    a tie the court above, whose last player moves down; from below, its first player moves up. The Courts page says
#    so in one line. The in-session court adjustment is unchanged (it still refuses and offers the organizer a choice).
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""    if(!to)for(let x=c-1;x>=1;x--)if(open(x)&&inUse(x)&&L[x].length<MAX){to=x;up=true;break;}
    if(!to)return fail(""", """    if(!to)for(let x=c-1;x>=1;x--)if(open(x)&&inUse(x)&&L[x].length<MAX){to=x;up=true;break;}
    // Starting courts only (inp.partner, no scores yet): every other court in use has five, so the nearest court in use
    // sends one player to play with them — on a tie the court above, whose last player moves down; from below, the first.
    if(!to&&inp.partner){let da=0,db=0;for(let x=c-1;x>=1&&!da;x--)if(open(x)&&inUse(x))da=x;for(let x=c+1;x<=nc&&!db;x++)if(open(x)&&inUse(x))db=x;
      const d=da&&(!db||c-da<=db-c)?da:db;
      if(d){const pid=d<c?L[d][L[d].length-1]:L[d][0];L[d]=L[d].filter(x=>x!==pid);L[c].push(pid);moves.push({id:pid,from:d,to:c,reason:d<c?'partner-down':'partner-up',with:id});continue;}}
    if(!to)return fail(""")
sub("""  const res=adjustCourts({nc:NC,lineup:L,names:Object.fromEntries(S.players.map(p=>[p.id,p.name])),locked:[],closed:[],absent:[],returning:[],late:[]});""",
    """  const res=adjustCourts({nc:NC,lineup:L,names:Object.fromEntries(S.players.map(p=>[p.id,p.name])),locked:[],closed:[],absent:[],returning:[],late:[],partner:true});""")
sub("""    :m.reason==='alone-up'?`${nm(m.id)} would be the only player on Court ${m.from}, the bottom court in use, so starts on Court ${m.to} above.`
    :`${nm(m.id)} would be the only player on Court ${m.from}, so starts on Court ${m.to}.`);""",
    """    :m.reason==='alone-up'?`${nm(m.id)} would be the only player on Court ${m.from}, the bottom court in use, so starts on Court ${m.to} above.`
    :m.reason==='partner-down'||m.reason==='partner-up'?`${nm(m.with)} would be the only player on Court ${m.to} and every other court in use has five, so ${nm(m.id)} moves ${m.reason==='partner-down'?'down':'up'} from Court ${m.from} to play there.`
    :`${nm(m.id)} would be the only player on Court ${m.from}, so starts on Court ${m.to}.`);""")
f.write_text(s)
print("p55 applied")
