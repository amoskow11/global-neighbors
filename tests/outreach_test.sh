#!/bin/bash
# Outreach and traction coach. Usage: tests/outreach_test.sh <base-url>
# Clears members and posts to check exact groups, so this suite only runs against a LOCAL database.
B="${1:-http://127.0.0.1:8788}"; PROJ="$(cd "$(dirname "$0")/.." && pwd)"
source "$(dirname "$0")/lib.sh"
if [ "$D1FLAG" == "--remote" ]; then echo "outreach_test clears results; local only"; exit 1; fi
sql "DELETE FROM outreach; DELETE FROM leads; DELETE FROM coach_log; DELETE FROM notifications; DELETE FROM nudges; DELETE FROM ratings; DELETE FROM help_replies; DELETE FROM help_posts; DELETE FROM landing_events; DELETE FROM landing_visitors; DELETE FROM campaigns; DELETE FROM sprints; DELETE FROM activity_events; DELETE FROM activity_sessions; DELETE FROM users"
join(){ req $1 POST auth/signup "{\"accountType\":\"$2\",\"displayName\":\"$3\",\"email\":\"$1$S@example.com\",\"password\":\"test password 123\",\"location\":\"Waltham\",\"region\":\"Greater Boston\",\"acceptTerms\":true}" >/dev/null; req $1 GET me >/dev/null; j "d['user']['id']"; }
seen(){ sql "INSERT INTO activity_sessions (id,user_id,kind,device,started_at,last_seen_at,active_ms) VALUES ('s$2$3$S','$1','member','mobile',$NOW-$3*86400000,$NOW-$3*86400000,1000)"; }
post(){ req $1 POST help "{\"type\":\"ask\",\"category\":\"Groceries & errands\",\"title\":\"$2\",\"detail\":\"Some detail about this post\",\"location\":\"Waltham\",\"region\":\"Greater Boston\",\"scale\":\"Neighborhood\",\"urgency\":\"Flexible\",\"payKind\":\"volunteer\",\"helpersNeeded\":1}" >/dev/null; j "d['post']['id']"; }
out(){ req adm GET admin/outreach >/dev/null; j "$1"; }
where(){ out "[k for k,v in d['segments'].items() for p in v if p['id']=='$1']"; }
send(){ req adm POST admin/outreach "{\"segment\":\"$1\",\"channel\":\"$2\",\"message\":\"$3\",\"userIds\":[\"$4\"]}"; }
NOW=$(python3 -c "import time;print(int(time.time()*1000))")

ADM=$(join adm person "Ada Admin"); sql "UPDATE users SET is_admin=1 WHERE id='$ADM'"
NEW=$(join new person "Nell New"); WAI=$(join wai person "Will Wait"); DRI=$(join dri person "Dee Drift"); sql "DELETE FROM login_attempts"
DOR=$(join dor person "Don Dorm"); LOO=$(join loo person "Lou Look"); PRO=$(join pro person "Pia Prof"); sql "DELETE FROM login_attempts"
CHA=$(join cha person "Cy Champ"); HEL=$(join hel person "Hal Help"); OFF=$(join off person "Ora Off"); ORG=$(join org org "Food Friends")
sql "UPDATE users SET created_at=$NOW-60*86400000 WHERE is_admin=0 AND id<>'$NEW'"
seen $NEW a 1; seen $WAI b 1; seen $DRI c 20; seen $DOR d 50; seen $LOO e 2; seen $PRO f 2; seen $CHA g 2; seen $HEL h 1; seen $OFF i 20; seen $ORG k 20
WP=$(post wai "Waiting post"); sql "UPDATE help_posts SET created_at=$NOW-4*86400000 WHERE id='$WP'"
PP=$(post pro "Fresh post one"); CP=$(post cha "Fresh post two"); HP=$(post hel "Done post")
req cha PATCH me '{"skills":["Driving"]}' >/dev/null
req pro POST help/$HP/replies '{"text":"I can do it"}' >/dev/null
sql "UPDATE help_replies SET status='completed', committed_at=$NOW-86400000, ended_at=$NOW-3600000; UPDATE help_posts SET status='resolved' WHERE id='$HP'"
req off PATCH me '{"suggestions":false}' >/dev/null

echo "== access"
check "guests blocked" 401 $(req nobody GET admin/outreach)
check "members blocked" 403 $(req new GET admin/outreach)
check "members can't send" 403 $(req new POST admin/outreach '{}')
check "members can't add prospects" 403 $(req new POST admin/leads '{}')
check "members can't log coach" 403 $(req new POST admin/coach '{}')
check "members can't edit prospects" 403 $(req new DELETE admin/leads/x)

echo "== groups"
check "welcome" "['welcome']" "$(where $NEW)"
check "waiting" "['waiting']" "$(where $WAI)"
check "drifting" "['drifting']" "$(where $DRI)"
check "dormant" "['dormant']" "$(where $DOR)"
check "first post" "['firstpost']" "$(where $LOO)"
check "poster who got help" "['thanks']" "$(where $HEL)"
check "helper who finished" "['thanks']" "$(where $PRO)"
check "champion" "['champion']" "$(where $CHA)"
check "opted out isn't listed" "[]" "$(where $OFF)"
check "opted out is counted" 1 "$(out "d['optedOut']")"
check "admin isn't listed" "[]" "$(where $ADM)"
check "organizations keep their full name" "Food Friends" "$(out "[p['name'] for p in d['segments']['drifting'] if p['id']=='$ORG'][0]")"
check "people show first name and initial" "Nell N." "$(out "d['segments']['welcome'][0]['name']")"
check "no email in the list" False "$(out "'example.com' in str(d)")"
check "pulse adds up" "(6, 0, 3, 1, 0)" "$(out "tuple(d['pulse'][k] for k in ('week','fortnight','month','older','never'))")"
sql "UPDATE users SET suspended_at=$NOW WHERE id='$LOO'"; check "suspended isn't listed" "[]" "$(where $LOO)"; sql "UPDATE users SET suspended_at=NULL WHERE id='$LOO'"

echo "== sending"
check "message required" 400 $(send welcome app "" $NEW)
check "message length" 400 $(send welcome app "$(python3 -c "print('x'*241)")" $NEW)
check "unknown group" 400 $(send everyone app "Hello there" $NEW)
check "nobody chosen" 400 $(req adm POST admin/outreach '{"segment":"welcome","channel":"app","message":"Hello there","userIds":[]}')
check "wrong group refused" 409 $(send dormant app "Hello there" $NEW)
check "opted out refused" 409 $(send drifting app "Hello there" $OFF)
check "admin refused" 409 $(send welcome app "Hello there" $ADM)
check "sends" 201 $(send welcome app "Welcome, {name}!" $NEW)
check "no address for in-app" False "$(j "'email' in d")"
req new GET notifications >/dev/null
check "name filled in" "welcome|Welcome, Nell!" "$(j "[n['detail'] for n in d['notifications'] if n['type']=='outreach'][0]")"
check "no sender shown" None "$(j "[n['actor'] for n in d['notifications'] if n['type']=='outreach'][0]")"
check "can't send twice in a week" 409 $(send welcome app "Again" $NEW)
check "shown as resting" True "$(out "d['segments']['welcome'][0]['resting']")"
check "also rests from match invitations" True "$(req adm GET admin/traction >/dev/null; j "all(p.get('resting') or p['id']!='$NEW' for q in d['queue'] if q['kind']=='match' for p in q['people'])")"
sql "UPDATE outreach SET created_at=$NOW-9*86400000 WHERE user_id='$NEW'"
check "same message waits 30 days" 409 $(send welcome app "Again" $NEW)
sql "UPDATE outreach SET created_at=$NOW-3600000 WHERE user_id='$NEW'"
check "email one at a time" 400 $(req adm POST admin/outreach "{\"segment\":\"drifting\",\"channel\":\"email\",\"userIds\":[\"$DRI\",\"$ORG\"]}")
check "email draft" 201 $(send drifting email "" $DRI)
check "address returned once" "dri$S@example.com" "$(j "d['email']")"
check "first name returned" Dee "$(j "d['firstName']")"
check "draft makes no notification" 0 "$(req dri GET notifications >/dev/null; j "len([n for n in d['notifications'] if n['type']=='outreach'])")"
check "second draft refused" 409 $(send drifting email "" $DRI)
check "org gets full name" "Food Friends" "$(send drifting email "" $ORG >/dev/null; j "d['firstName']")"
sql "INSERT INTO activity_sessions (id,user_id,kind,device,started_at,last_seen_at,active_ms) VALUES ('back$S','$NEW','member','mobile',$NOW+1000,$NOW+1000,1)"
post new "First post" >/dev/null
check "results" "(1, 1, 1)" "$(out "[(r['sent'],r['returned'],r['acted']) for r in d['results'] if r['segment']=='welcome'][0]")"
check "too many" 400 $(req adm POST admin/outreach "{\"segment\":\"welcome\",\"channel\":\"app\",\"message\":\"Hello\",\"userIds\":$(python3 -c "import json;print(json.dumps([str(i) for i in range(26)]))")}")

echo "== prospects"
check "name required" 400 $(req adm POST admin/leads '{"kind":"senior","audience":"elder"}')
check "bad type" 400 $(req adm POST admin/leads '{"name":"X","kind":"zoo","audience":"elder"}')
check "bad date" 400 $(req adm POST admin/leads '{"name":"X","kind":"senior","audience":"elder","followUp":"2026-13-01"}')
check "adds" 201 $(req adm POST admin/leads '{"name":"Test Senior Center","kind":"senior","audience":"elder","place":"Waltham"}')
L=$(j "d['lead']['id']"); TAG=$(j "d['lead']['tag']")
check "own link" True "$(python3 -c "import re;print(bool(re.fullmatch('invite-[0-9a-f]{8}','$TAG')))")"
check "duplicate refused" 409 $(req adm POST admin/leads '{"name":"test senior center","kind":"senior","audience":"elder"}')
check "not contacted yet" None "$(out "d['leads'][0]['contactedAt']")"
check "stage changes" 200 $(req adm POST admin/leads/$L '{"status":"contacted","followUp":"2026-12-01"}')
check "kept other fields" "('Test Senior Center', 'Waltham', '2026-12-01')" "$(j "(d['lead']['name'],d['lead']['place'],d['lead']['followUp'])")"
check "contact date kept" True "$(j "d['lead']['contactedAt'] > 0")"
check "bad stage" 400 $(req adm POST admin/leads/$L '{"status":"won"}')
sql "INSERT INTO landing_visitors VALUES ('solo-b','v$S','B','$TAG','mobile',$NOW); INSERT INTO landing_events VALUES ('solo-b','v$S','signup:org',$NOW)"
check "visits and sign-ups credited" "(1, 1)" "$(out "(d['leads'][0]['visits'],d['leads'][0]['joins'])")"
check "not listed with untracked links" "[]" "$(req adm GET admin/traction >/dev/null; j "[u for u in d['untracked'] if u['source']=='$TAG']")"
check "removes" 200 $(req adm DELETE admin/leads/$L)
check "gone" 404 $(req adm POST admin/leads/$L '{"status":"joined"}')

echo "== coach"
check "bad key" 400 $(req adm POST admin/coach '{"key":"../x","title":"T","status":"done"}')
check "bad choice" 400 $(req adm POST admin/coach '{"key":"welcome","title":"T","status":"maybe"}')
check "done saved" 201 $(req adm POST admin/coach '{"key":"welcome","title":"Welcome people","status":"done","metric":"posts"}')
C=$(j "d['entry']['id']")
check "baseline saved" 5 "$(j "d['entry']['baseline']")"
post wai "Another post" >/dev/null
check "then and now" "(5, 6)" "$(out "(d['coach'][0]['baseline'],d['coach'][0]['value'])")"
check "later returns in two days" 2 "$(req adm POST admin/coach '{"key":"idea:faith","title":"T","status":"later"}' >/dev/null; j "round((d['entry']['until']-d['entry']['at'])/86400000)")"
check "unknown metric ignored" "" "$(req adm POST admin/coach '{"key":"idea:x","title":"T","status":"done","metric":"users; drop"}' >/dev/null; j "d['entry']['metric']")"
check "undo" 200 $(req adm DELETE admin/coach/$C)
check "undone" "[]" "$(out "[c for c in d['coach'] if c['id']=='$C']")"

echo "== deletion"
check "account deletion works" 200 $(req new DELETE me '{"password":"test password 123"}')
check "outreach record goes with it" "[]" "$(out "[r for r in d['results'] if r['segment']=='welcome']")"
finish
