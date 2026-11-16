from pathlib import Path
import urllib.request,urllib.error,time,json,os
os.environ['NO_PROXY']='127.0.0.1,localhost'
source=Path(r'D:\work\dshPlugIn\dsh-token-statusbar-workbuddy')
installed=Path(r'C:\Users\Limu\.dsh\profiles\desktop\node_modules\dsh-token-statusbar-workbuddy')
backup=Path(r'C:\Users\Limu\.dsh\backups\statusbar-performance-20261115')
for relative in ['lib/billing-worker.js']:
 target=installed/relative
 (backup/('before-idle-'+relative.replace('/','-'))).write_bytes(target.read_bytes())
 target.write_bytes((source/relative).read_bytes())
p=Path(r'C:\Users\Limu\.dsh\profiles\desktop\cordis.patch.yml');before=p.read_bytes()
probe=before+b'\n# scoped idle worker reload\n- id: dsh-token-statusbar-workbuddy\n  disabled: true\n'
try:
 p.write_bytes(probe);time.sleep(3)
finally:
 if p.read_bytes()!=probe:raise RuntimeError('Concurrent profile edit; preserved current contents')
 p.write_bytes(before)
time.sleep(3)
url='http://127.0.0.1:51929/plugins/dsh-token-statusbar-workbuddy/billing?sessions=synthetic-memory-check-no-session'
with urllib.request.urlopen(url,timeout=30) as response:payload=json.load(response)
assert payload.get('ok') is not False,payload.get('error')
print(json.dumps({'installedWorkerMatchesSource':(installed/'lib/billing-worker.js').read_bytes()==(source/'src/billing-worker.js').read_bytes(),'profileRestored':p.read_bytes()==before,'billingRouteHealthy':True,'modelCalls':0}))

