# p91 (September 22, 2026): the court panel stops repeating itself, and the page says which build it is.
#  From the organizer, with a screenshot of the Court 4 panel titled "Court 4 — Court 4": "what is this".
#  Courts 1, 2 and 3 carry a medal name ("Court 1 — 🥇 Top Court"), and courts 4, 5 and 6 have none, so the badge fell
#  back to the court's own name and the title printed it twice. It now shows the medal when there is one and the plain
#  court name when there is not.
#  Second, the organizer reported a fix as "still not working" while the build carrying that fix had just been
#  published. There was no way for either of us to tell which build their browser was actually running: the version
#  lives in the service worker's cache name and nothing on the page showed it. The watermark now carries it, taken
#  from the cache that is really serving the page, so a stale tab can be recognised instead of argued about.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""  const badge=showMedals?(court===1?'🥇 Top Court':court===2?'🥈 2nd Court':court===3?'🥉 3rd Court':`Court ${court}`):`Court ${court}`;
  openModal(`Court ${court} — ${badge}`,`""",
    """  // p91: only the top three courts have a name of their own; the rest are just their number, and printing that
  // after the court name gave "Court 4 — Court 4".
  const medal=showMedals?(court===1?'🥇 Top Court':court===2?'🥈 2nd Court':court===3?'🥉 3rd Court':''):'';
  openModal(`Court ${court}${medal?' — '+medal:''}`,`""")

sub("""<div class="watermark">DC Badminton Club · Christy George</div>""",
    """<div class="watermark">DC Badminton Club · Christy George<span id="build-tag"></span></div>""")

# The version that is actually serving this page, so a stale tab can be told apart from a bug.
sub("""async function checkPushState(){""",
    """// p91: the build serving this page, read from the service worker cache that is really in use. A tab kept open for
// days serves the build it cached, and until now nothing on the page said which one that was.
async function showBuildTag(){
  const el=document.getElementById('build-tag');if(!el)return;
  try{
    if(!('caches'in window))return;
    // This site's own caches only: the league site and the test site are different origins' worth of data, and a
    // browser that has visited both must not report the other one's build.
    const prefix=SITE_ENV==='production'?'dcbc-prod-':'dcbc-test-';
    const mine=(await caches.keys()).filter(k=>k.startsWith(prefix)).sort();
    if(!mine.length)return;
    const v=mine[mine.length-1].slice(prefix.length);
    el.textContent=` · build ${v}`;
  }catch(e){/* storage can be blocked; the watermark simply stays as it was */}
}
async function checkPushState(){""")

# Show it once the page is up, and again after the worker swaps a new build in.
sub("""function registerServiceWorker(){
  if(location.protocol!=='file:'&&'serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}""",
    """function registerServiceWorker(){
  if(location.protocol!=='file:'&&'serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
    navigator.serviceWorker.addEventListener('controllerchange',()=>{showBuildTag();}); // p91: a new build took over
  }
}
showBuildTag(); // p91""")

f.write_text(s)
print("p91 applied")
