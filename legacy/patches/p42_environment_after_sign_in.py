# p42 (September 12, 2026): the environment check in two steps, so anonymous visitors still read nothing.
#  - Before anything loads: the database address must match the site (a test site never points at production; the
#    league site only at the league database). No request is made.
#  - Right after sign-in (on opening the page with a saved sign-in, and after signing in): the database's marker
#    (migration L18, readable by signed-in users only) must agree. On a test site, a missing marker, a refused read or a
#    marker other than "test" stops the page; on the league site, a marker other than "production" does.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

a = s.index("// ── Environment check (L18): the test site runs only against a database marked \"test\"; the league site never does. ──")
b = s.index("async function init(){\n  if(!(await checkEnvironment()))return;\n  installUndoCheckpoints();")
b_end = b + len("async function init(){\n  if(!(await checkEnvironment()))return;\n  installUndoCheckpoints();")
old_block = s[a:b]
stop = old_block[old_block.index("const stop=m=>{") + len("const stop=m=>{"):old_block.index("return false;};")]
s = s[:a] + """// ── Environment check (L18). The page's own address says which site it is: /dcbadmintonclub/ is the league site,
//    anything else is a test site. Before anything loads, the database address must match the site; right after
//    sign-in (anonymous visitors can read nothing), the database's own marker must agree too. ──
const SITE_ENV=location.pathname.startsWith('/dcbadmintonclub/')?'production':'test';
function envStop(m){""" + stop + """return false;}
function checkSiteAddress(){
  const prodDb=SB.includes('bwepvxelvwgwxrnaglrx');
  if(SITE_ENV==='test'&&prodDb)return envStop('The test site points at the production database.');
  if(SITE_ENV==='production'&&!prodDb)return envStop('The league site points at a database that is not the league database.');
  return true;
}
async function checkDatabaseMarker(){
  let r;try{r=await sbFetch('/rest/v1/environment?select=name,schema_version');}catch(e){return true;} // offline: the usual sync error shows instead
  if(!r.ok)return SITE_ENV==='test'?envStop('The test database is not marked as TEST.'):true;          // a league database from before L18 has no marker yet
  const rows=await r.json().catch(()=>[]);const env=Array.isArray(rows)&&rows[0]?rows[0]:null;window.DB_ENV=env;
  if(SITE_ENV==='test'&&(!env||env.name!=='test'))return envStop(env?`The test site is connected to a database marked “${esc(env.name)}”.`:'The test database is not marked as TEST.');
  if(SITE_ENV==='production'&&env&&env.name!=='production')return envStop(`The league site is connected to a database marked “${esc(env.name)}”.`);
  return true;
}
async function init(){
  if(!checkSiteAddress())return;
  installUndoCheckpoints();""" + s[b_end:]
sub("""  if(!signed){setSS('err');updateNavVisibility();registerServiceWorker();return;}""",
    """  if(!signed){setSS('err');updateNavVisibility();registerServiceWorker();return;}
  if(!(await checkDatabaseMarker()))return;""")
sub("async function afterSignIn(){showGate(false);", "async function afterSignIn(){if(!(await checkDatabaseMarker()))return;showGate(false);")
assert "checkEnvironment" not in s
f.write_text(s)
print("p42 applied")
