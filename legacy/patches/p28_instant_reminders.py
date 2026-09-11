# p28 (September 11, 2026): the Tools email buttons send at once instead of waiting for GitHub's late timer.
# They queue the request as before, then ask the database to start the reminder job right away (L14,
# public.dispatch_reminder_job) and watch for the job's result, which appears within about a minute.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""    await setKV('reminder_request',{kind,id:String(Date.now()),at:new Date().toISOString(),session:n,by:myEmail(),to:myEmail()});
    await loadAll();renderAll();
    toast(kind==='smoke'?`Test email queued for ${myEmail()} — sent on the next scheduled check (usually within an hour or two)`:`Reminders for Session ${n} queued — sent on the next scheduled check (usually within an hour or two)`,'success');
  }catch(e){toast('Not queued: '+e.message,'error');}""", """    await setKV('reminder_request',{kind,id:String(Date.now()),at:new Date().toISOString(),session:n,by:myEmail(),to:myEmail()});
    const before=S.reminderLastRun&&S.reminderLastRun.at;
    let d=null;try{d=await rpc('dispatch_reminder_job',{p_reason:kind});}catch(e){d={dispatched:false,reason:e.message};}
    await loadAll();renderAll();
    if(!d||!d.dispatched){toast(`Queued — ${d&&d.reason?d.reason:'instant sending is not set up'}. It goes out on the next scheduled check.`,'warn');return;}
    toast(kind==='smoke'?`Sending the test email to ${myEmail()} now…`:`Sending reminders for Session ${n} now…`,'success');
    // The job reports back through reminder_last_run; watch for it for up to two minutes.
    for(let i=0;i<24;i++){
      await new Promise(r=>setTimeout(r,5000));
      await loadAll();renderReminderTools();
      const last=S.reminderLastRun;
      if(last&&last.at&&last.at!==before){renderAll();toast(`✅ Done — ${last.sent||0} email${last.sent===1?'':'s'} sent${kind==='smoke'?' (check '+myEmail()+')':''}`,'success');return;}
    }
    toast('Still sending — the status below updates when it is done','info');
  }catch(e){toast('Not sent: '+e.message,'error');}""")
sub("""— waiting for the next scheduled check (usually within an hour or two).""", """— sending now; this line clears when it is done.""")
sub("""A scheduled check runs through the day. GitHub often starts it late, so allow up to a couple of hours. These buttons ask it to act on its next check instead of waiting for the weekly window.""",
    """Reminders go out automatically on a timer every 10 minutes during each voting window. These buttons send straight away; the result shows below within about a minute.""")
f.write_text(s)
print("p28 applied")
