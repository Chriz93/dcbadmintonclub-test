# p53 (September 12, 2026): the TEST site said "Cannot connect to database" for everyone who signed in.
#  - The page's read helper adds order=created_at to any query that does not name its own order. The waiver_versions
#    table (L20) has no created_at column, so the database refused the two queries that read the current waiver
#    version, the page's load failed, and the site showed "Cannot connect to database". The in-memory stand-in the
#    tests use did not check column names, so no test saw it; it now refuses unknown columns on the new tables as the
#    database does, and every suite fails on such a refusal.
#  - Both queries now name their order (version).
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""sbG('waiver_versions','is_current=eq.true&select=version,title,published_at')""", """sbG('waiver_versions','is_current=eq.true&select=version,title,published_at&order=version.asc')""")
sub("""sbG('waiver_versions','is_current=eq.true&select=version,title,body,sha256,published_at')""", """sbG('waiver_versions','is_current=eq.true&select=version,title,body,sha256,published_at&order=version.asc')""")
f.write_text(s)
print("p53 applied")
