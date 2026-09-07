#!/usr/bin/env python3
"""Encrypted DB backup, TEST only. Needs pg_dump and age installed by operator.
No production target accepted. Environment secrets are never printed.
"""
import os, pathlib, subprocess, urllib.parse, sys, hashlib
url=urllib.parse.urlparse(os.environ['TEST_DATABASE_URL'])
approved=os.environ['APPROVED_TEST_DB_HOST']
if url.hostname!=approved or 'bwepvxelvwgwxrnaglrx' in (url.hostname or '') or 'bwepvxelvwgwxrnaglrx' in (url.username or ''):
    sys.exit('Production or unapproved database rejected')
if url.scheme not in ('postgres','postgresql'): sys.exit('Invalid database scheme')
out=pathlib.Path(sys.argv[1]).resolve()
if out.exists():sys.exit('Refusing to overwrite backup')
recipient=os.environ['BACKUP_AGE_RECIPIENT']
if not recipient.startswith('age1'):sys.exit('Use an age public recipient')
env={**os.environ,'PGHOST':url.hostname,'PGPORT':str(url.port or 5432),'PGUSER':urllib.parse.unquote(url.username or ''),'PGPASSWORD':urllib.parse.unquote(url.password or ''),'PGDATABASE':url.path.lstrip('/'),'PGSSLMODE':'verify-full'}
out.parent.mkdir(parents=True,exist_ok=True);os.umask(0o077)
with out.open('xb') as encrypted:
    dump=subprocess.Popen(['pg_dump','--format=custom','--no-owner','--no-acl'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    encrypt=subprocess.run(['age','-r',recipient],stdin=dump.stdout,stdout=encrypted,stderr=subprocess.PIPE)
    dump.stdout.close();_,err=dump.communicate()
if dump.returncode or encrypt.returncode:sys.exit('Backup failed; retain partial artifact for investigation. Do not use it to restore.')
print('Encrypted test backup written. SHA-256:',hashlib.sha256(out.read_bytes()).hexdigest())
print('Not verified until decrypted and restored into a separate disposable test database.')
