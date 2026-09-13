// Read-only release preflight: this script never migrates a database or writes league records.
const base='https://wgolevihkvmosajumzvl.supabase.co';
if(process.env.GITHUB_REPOSITORY!=='Chriz93/dcbadmintonclub-test')throw Error('Only the TEST repository can release this artifact');
const key=process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw Error('Set the TEST_SUPABASE_SERVICE_ROLE_KEY repository secret before release');
const response=await fetch(base+'/rest/v1/environment?select=name,schema_version',{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('TEST database preflight failed: HTTP '+response.status);
const rows=await response.json();
if(rows.length!==1||rows[0].name!=='test'||!/^L(?:2[4-9]|[3-9][0-9])$/.test(rows[0].schema_version))throw Error('Apply and verify TEST migrations through L24 before releasing');
console.log('TEST database identity and schema verified; no records changed.');
