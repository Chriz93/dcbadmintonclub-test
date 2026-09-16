# p73 (September 16, 2026): a request that never answers is given up on, instead of spinning for ever.
#  From the organizer (production, 15 September, session 1): "I wasnt able to submit the scores of court 1, it kept
#  rotating and then timed out, after that, we didnt see the scores, courts etc tabs". The save had wedged the league's
#  lock in the database (L26 bounds that side). On the page, the request itself had no time limit: the Save button span
#  until the browser gave up minutes later, and every reload behind it waited too, so the night could not go on.
#  Now every request to the database is given at most 25 seconds (12 for a plain read), after which the page stops
#  waiting and says so plainly. Nothing is written twice: the save either happened or it did not, and the organizer is
#  told to look at the court and save again.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""const r=await fetch(SB+path,{...opts,headers:{...authHeaders(),...(opts.headers||{})}});""",
    """const r=await _fetchWithLimit(SB+path,{...opts,headers:{...authHeaders(),...(opts.headers||{})}});""")
sub("""async function sbFetch(path,opts={}){""",
    """// p73: a request the server never answers is given up on, so a save can never spin for ever (15 September: a wedged
// score save left the Save button turning and every later request waiting behind it). A read is given less time than a
// write, and a write that timed out is reported as "not saved" — the organizer reviews the court and saves again.
let REQUEST_LIMIT_MS=25000,READ_LIMIT_MS=12000;   // (let, so a test can shorten them)
async function _fetchWithLimit(url,opts={}){
 const method=(opts.method||'GET').toUpperCase(),limit=method==='GET'?READ_LIMIT_MS:REQUEST_LIMIT_MS;
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),limit);
 try{return await fetch(url,{...opts,signal:ac.signal});}
 catch(e){
  if(e&&e.name==='AbortError'){const t=new Error(method==='GET'?'The league database did not answer in time — check the connection and try again.':'The league database did not answer in time — nothing was saved. Check the court and save again.');t.status=504;t.timedOut=true;throw t;}
  throw e;
 }
 finally{clearTimeout(timer);}
}
async function sbFetch(path,opts={}){""")

f.write_text(s)
print("p73 applied")
