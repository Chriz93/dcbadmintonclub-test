# p35 (September 12, 2026): the site refuses to run against the wrong database.
#  - The page's own address says which site it is: /dcbadmintonclub/ is the league (production) site; anything else
#    (/dcbadmintonclub-test/, a local copy) is a test site.
#  - A test site that points at the production database, or a league site that points anywhere else, stops before
#    loading anything and says so. So does a test site whose database is not marked "test" (migration L18), and a
#    league site whose database is marked "test". A league database without a marker (before L18 there) still loads.
#  - The same code runs on both sites; only the database address and key differ (build-production.py).
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""async function init(){
  installUndoCheckpoints();""", """// ── Environment check (L18): the test site runs only against a database marked "test"; the league site never does. ──
const SITE_ENV=location.pathname.startsWith('/dcbadmintonclub/')?'production':'test';
async function checkEnvironment(){
  const stop=m=>{document.body.innerHTML=`<main id="env-stop" role="alert" style="max-width:520px;margin:14vh auto;padding:24px;font:16px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif;color:#14201a;background:#fff;border:2px solid #b42318;border-radius:14px;"><h1 style="font-size:22px;margin:0 0 8px;">This site is connected to the wrong database</h1><p style="margin:0;">${m}</p><p style="margin:12px 0 0;color:#44544a;">Nothing was loaded or saved. Please tell the organizer.</p></main>`;return false;};
  const prodDb=SB.includes('bwepvxelvwgwxrnaglrx');
  if(SITE_ENV==='test'&&prodDb)return stop('The test site points at the production database.');
  if(SITE_ENV==='production'&&!prodDb)return stop('The league site points at a database that is not the league database.');
  let r;try{r=await fetch(SB+'/rest/v1/environment?select=name,schema_version',{headers:{apikey:SK}});}catch(e){return true;} // offline: the usual sync error shows instead
  if(!r.ok){const t=await r.text().catch(()=>'');const missing=r.status===404||/PGRST205|42P01/.test(t);return missing&&SITE_ENV==='test'?stop('The test database is not marked as TEST.'):true;}
  const rows=await r.json().catch(()=>[]);const env=Array.isArray(rows)&&rows[0]?rows[0]:null;window.DB_ENV=env;
  if(SITE_ENV==='test'&&(!env||env.name!=='test'))return stop(env?`The test site is connected to a database marked “${esc(env.name)}”.`:'The test database is not marked as TEST.');
  if(SITE_ENV==='production'&&env&&env.name!=='production')return stop(`The league site is connected to a database marked “${esc(env.name)}”.`);
  return true;
}
async function init(){
  if(!(await checkEnvironment()))return;
  installUndoCheckpoints();""")
f.write_text(s)
print("p35 applied")
