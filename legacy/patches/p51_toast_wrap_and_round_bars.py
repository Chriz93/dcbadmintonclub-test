# p51 (September 12, 2026): two display faults found in the exploratory screenshots.
#  - Long messages (for example "Omar marked absent — press Adjust courts to update the courts. One court down next
#    week.") ran off the right edge of a phone screen because the message was kept on one line. They now wrap inside
#    the screen.
#  - The round progress bars (Scores page and Courts page) drew one segment per possible round (NCYC, 99), so they
#    showed a row of dots. A session has MAX_ROUNDS_PER_SESSION (2) rounds; the bars now show exactly those.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""white-space:nowrap;max-width:88vw;""", """white-space:normal;width:max-content;max-width:calc(100vw - 24px);box-sizing:border-box;overflow-wrap:anywhere;""")
sub("""  if(cb)cb.innerHTML=Array.from({length:NCYC},(_,i)=>`<div class="cyseg ${i<cy-1?'done':i===cy-1&&S.current?'act':''}"></div>`).join('');""",
    """  if(cb)cb.innerHTML=Array.from({length:MAX_ROUNDS_PER_SESSION},(_,i)=>`<div class="cyseg ${i<cy-1?'done':i===cy-1&&S.current?'act':''}"></div>`).join('');""")
sub("""  for(let r=1;r<=NCYC;r++){
    const isDone=r<cy;const isActive=r===cy;
    html+=`<div style="flex:1;""",
    """  for(let r=1;r<=MAX_ROUNDS_PER_SESSION;r++){
    const isDone=r<cy;const isActive=r===cy;
    html+=`<div class="round-seg" style="flex:1;""")
f.write_text(s)
print("p51 applied")
