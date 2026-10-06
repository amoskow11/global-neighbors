#!/bin/bash
# Usage analytics: activity pings and the admin dashboard. Usage: tests/activity_test.sh <base-url>
B="${1:-http://127.0.0.1:8788}"; PROJ="$(cd "$(dirname "$0")/.." && pwd)"
source "$(dirname "$0")/lib.sh"
sid(){ python3 -c "import secrets;print(secrets.token_hex(16))"; }
ping(){ req $1 POST activity "{\"sid\":\"$2\",\"activeMs\":$3,\"device\":\"$4\",\"events\":$5}"; }

echo "== recording"
check "bad session id rejected" 400 $(ping anon "not-a-sid" 0 desktop '[]')
check "form-encoded ping blocked" 415 $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: text/plain' --data '{}' "$B/api/activity")
G=$(sid)
check "guest session starts" 200 $(ping anon $G 0 mobile '["help_board"]')
check "server keeps guest sid" "$G" "$(j "d['sid']")"
sleep 2
check "guest ping" 200 $(ping anon $G 999999 mobile '["post_view","not_a_feature","guest_draft"]')
check "signup person" 201 $(signup anon person "Tess $S" "tess$S@example.com")
check "guest session converts on login" 200 $(ping anon $G 1000 mobile '["post_create"]')
check "same session kept" "$G" "$(j "d['sid']")"
M=$(sid)
check "signup org" 201 $(signup o org "Activity Org $S" "actorg$S@example.com")
check "member session" 200 $(ping o $M 0 desktop '["directory"]')
sleep 3
check "member ping" 200 $(ping o $M 3000 desktop '["directory","org_view","search","reply"]')
check "other user can't reuse sid" 200 $(ping anon $M 0 desktop '[]')
check "reused sid rotated" True "$(j "d['sid']!='$M' and len(d['sid'])==32")"

echo "== admin dashboard"
check "non-admin blocked" 403 $(req o GET 'admin/activity?days=7')
check "guests blocked" 401 $(req nobody GET 'admin/activity?days=7')
check "signup admin" 201 $(signup m person "Stats Admin $S" "statsadmin$S@example.com")
sql "UPDATE users SET is_admin=1 WHERE email='statsadmin$S@example.com'"
A=$(sid); ping m $A 0 desktop '["admin","admin","admin"]' >/dev/null
check "dashboard loads" 200 $(req m GET "admin/activity?days=7&tz=300")
check "sessions counted (admin excluded)" True "$(j "d['summary']['sessions']>=2")"
check "conversion counted" True "$(j "d['summary']['conversions']>=1")"
check "mobile session counted" True "$(j "d['summary']['mobileSessions']>=1")"
check "unknown feature dropped" False "$(j "any(f['feature']=='not_a_feature' for f in d['features'])")"
check "admin activity excluded" False "$(j "any(f['feature']=='admin' for f in d['features'])")"
check "admins not listed as members" False "$(j "any(m['email']=='statsadmin$S@example.com' for m in d['members'])")"
check "org listed with sessions" 1 "$(j "[m['sessions'] for m in d['members'] if m['email']=='actorg$S@example.com'][0]")"
check "org top feature" directory "$(j "[m['topFeature'] for m in d['members'] if m['email']=='actorg$S@example.com'][0]")"
check "time credit capped to elapsed time" True "$(j "[m['activeMs'] for m in d['members'] if m['email']=='actorg$S@example.com'][0] <= 9000")"
(cd "$PROJ" && npx -y wrangler d1 execute global-neighbors-db ${D1FLAG:---local} --json --command "SELECT active_ms FROM activity_sessions WHERE id='$G'" 2>/dev/null) > $T/g.json
check "guest active time capped to elapsed time" True "$(python3 -c "import json;print(json.load(open('$T/g.json'))[0]['results'][0]['active_ms'] < 15000)")"
check "daily series present" True "$(j "len(d['daily'])>=1 and 'day' in d['daily'][0]")"
UO=$(j "[m['id'] for m in d['members'] if m['email']=='actorg$S@example.com'][0]")
UT=$(j "[m['id'] for m in d['members'] if m['email']=='tess$S@example.com'][0]")
check "member detail" 200 $(req m GET "admin/activity/users/$UO?days=30&tz=0")
check "detail features" "['directory', 'org_view', 'reply', 'search']" "$(j "sorted(f['feature'] for f in d['features'])")"
check "detail sessions" 1 "$(j "len(d['sessions'])")"
check "converted session flagged" True "$(req m GET "admin/activity/users/$UT?days=30" >/dev/null; j "any(s['fromGuest'] for s in d['sessions'])")"
check "unknown member 404" 404 $(req m GET "admin/activity/users/nope?days=7")
check "days clamped" 365 "$(req m GET 'admin/activity?days=99999' >/dev/null; j "d['days']")"

echo "== deletion"
check "org deletes account" 200 $(req o DELETE me '{"password":"test password 123"}')
(cd "$PROJ" && npx -y wrangler d1 execute global-neighbors-db ${D1FLAG:---local} --json --command "SELECT (SELECT COUNT(*) FROM activity_sessions WHERE user_id='$UO') + (SELECT COUNT(*) FROM activity_events WHERE user_id='$UO') AS n" 2>/dev/null) > $T/body
check "activity deleted with account" 0 "$(python3 -c "import json;print(json.load(open('$T/body'))[0]['results'][0]['n'])")"
finish
