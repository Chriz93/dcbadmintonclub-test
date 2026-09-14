# p67 (September 13, 2026): "Share as image" says at once that it is working.
#  Found by the keyboard census on GitHub's checks (Home, a spare's view): the button draws a 1080 × 1080 image before
#  anything happens (the share sheet or the download), with no word in between; on a slower machine that took longer
#  than the census waits, and to a person it looks like a button that does nothing. Without a player record it
#  returned without a word.
#  - It now says "Preparing your season image…" at once, and asks to sign in as a player when there is no player record.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("async function shareMySeason(){\n  const me=myPlayer();if(!me)return;const d=mySeasonData(me);",
    "async function shareMySeason(){\n  const me=myPlayer();if(!me)return toast('Sign in as a player to share your season','info');const d=mySeasonData(me);\n"
    "  toast('Preparing your season image…','info'); // p67: drawing the image takes a moment; say so at once")

f.write_text(s)
print("p67 applied")
