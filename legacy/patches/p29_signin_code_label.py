# p29 (September 11, 2026): the sign-in box no longer promises a 6-digit code. Supabase sends 8 digits on the test
# project (the length is a project setting); the box already accepted 6–8 digits, only its label was wrong.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
old = 'id="signin-code-input" placeholder="6-DIGIT CODE"'
assert s.count(old) == 1, s.count(old)
s = s.replace(old, 'id="signin-code-input" placeholder="CODE FROM YOUR EMAIL"')
f.write_text(s)
print("p29 applied")
