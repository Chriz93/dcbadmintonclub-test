# p56 (September 13, 2026): the audit remediation Codex made directly in index.html (commit f3037c6), recorded as a patch
# so the replay check still rebuilds index.html from c89c894. It applies p56_codex_audit.diff (git diff fbd1b1f f3037c6
# -- index.html) and refuses unless the whole diff applies cleanly. Reviewed and corrected by p57 and later patches.
import pathlib, subprocess
here = pathlib.Path(__file__).resolve()
root = here.parents[2]
diff = here.with_name("p56_codex_audit.diff")
check = subprocess.run(["git", "apply", "--check", str(diff)], cwd=root, capture_output=True, text=True)
assert check.returncode == 0, check.stderr
subprocess.run(["git", "apply", str(diff)], cwd=root, check=True)
print("p56 applied")
