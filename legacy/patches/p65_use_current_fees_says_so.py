# p65 (September 13, 2026): "Use current fees and session time" says what it did.
#  Found by the keyboard census (tabs/keys.spec.ts): Admin → Tools → "Use current fees and session time" fills the
#  next-season fields without a word; when they already held those values, or the season settings were not loaded,
#  pressing it showed nothing at all, like a button that does not work.
#  - It now says the fields were filled in, and when the settings are not loaded it says so instead of doing nothing.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("function prepareNextSeason(){\n const c=S.seasonConfig;if(!c)return;",
    "function prepareNextSeason(){\n const c=S.seasonConfig;if(!c)return toast('The current season settings are not loaded yet — refresh and try again','warn'); // p65")
sub(" for(const [key,value]of Object.entries(fields))document.getElementById('new-season-'+key).value=value;\n}",
    " for(const [key,value]of Object.entries(fields))document.getElementById('new-season-'+key).value=value;\n"
    " toast('Filled in with the current fees and session time — change what differs for next season','info'); // p65\n}")

f.write_text(s)
print("p65 applied")
