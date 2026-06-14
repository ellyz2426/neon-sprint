cd ~/workspace/iwsdk-daily-builds
python3 -c "
import json, datetime
with open('current-build-status-pm.json','r') as f: d = json.load(f)
d['status'] = 'building'
d['last_updated_utc'] = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
with open('current-build-status-pm.json','w') as f: json.dump(d, f, indent=2)
print('Status updated to building')
"
