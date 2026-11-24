#!/bin/bash
# Traction dashboard: metrics, matching, suggestions, sprint goals, and campaigns. Usage: tests/traction_test.sh <base-url>
# Clears posts and visits to check exact counts, so this suite only runs against a LOCAL database.
B="${1:-http://127.0.0.1:8788}"; PROJ="$(cd "$(dirname "$0")/.." && pwd)"
source "$(dirname "$0")/lib.sh"
if [ "$D1FLAG" == "--remote" ]; then echo "traction_test clears results; local only"; exit 1; fi
sql "DELETE FROM notifications; DELETE FROM nudges; DELETE FROM ratings; DELETE FROM help_replies; DELETE FROM help_posts; DELETE FROM landing_events; DELETE FROM landing_visitors; DELETE FROM campaigns; DELETE FROM sprints; DELETE FROM activity_events; DELETE FROM activity_sessions; DELETE FROM users"
join(){ req $1 POST auth/signup "{\"accountType\":\"$2\",\"displayName\":\"$3\",\"email\":\"$1$S@example.com\",\"password\":\"test password 123\",\"location\":\"$4\",\"region\":\"$5\",\"acceptTerms\":true}" >/dev/null; req $1 GET me >/dev/null; j "d['user']['id']"; }
post(){ req $1 POST help "{\"type\":\"$2\",\"category\":\"$3\",\"title\":\"$4\",\"detail\":\"Some detail about this post\",\"location\":\"$5\",\"region\":\"$6\",\"scale\":\"Neighborhood\",\"urgency\":\"Flexible\",\"payKind\":\"volunteer\",\"helpersNeeded\":1}" >/dev/null; j "d['post']['id']"; }
tr(){ req adm GET admin/traction >/dev/null; j "$1"; }
q(){ tr "[(x['kind'],[p['name'] for p in x['people']]) for x in d['queue'] if x['postId']=='$1']"; }
nudge(){ req adm POST admin/nudges "{\"kind\":\"$1\",\"postId\":\"$2\",\"userIds\":[\"$3\"]}"; }

ADM=$(join adm person "Ada Admin" Boston "Greater Boston"); sql "UPDATE users SET is_admin=1 WHERE id='$ADM'"
ANN=$(join ann person "Ann Asker" "Waltham, MA" "Greater Boston")
BOB=$(join bob person "Bob Baker" Waltham "Greater Boston")
CAT=$(join cat person "Cat Cole" Denver "North America")
DOT=$(join dot person "Dot Diaz" Waltham "Greater Boston")
ORG=$(join org org "Food Friends" Newton "Greater Boston")
req org PATCH me '{"causes":["Food Security","Elder Care"]}' >/dev/null

echo "== access"
check "guests blocked" 401 $(req nobody GET admin/traction)
check "members blocked" 403 $(req ann GET admin/traction)
check "members can't send suggestions" 403 $(req ann POST admin/nudges '{}')
check "members can't make campaigns" 403 $(req ann POST admin/campaigns '{}')
check "members can't set goals" 403 $(req ann POST admin/sprint '{}')
check "dashboard loads" 200 $(req adm GET admin/traction)
check "admin not counted" "(5, 1)" "$(j "(d['totals']['signups'],d['totals']['orgs'])")"
check "empty queue" "[]" "$(j "d['queue']")"

echo "== matching"
P1=$(post ann ask "Groceries & errands" "Weekly groceries" "Waltham" "Greater Boston")
P2=$(post cat offer "Groceries & errands" "Can shop for you" "Denver" "North America")
check "neighbors and org found, far-away shopper isn't" "[('match', ['Bob B.', 'Dot D.', 'Food Friends'])]" "$(tr "[(x['kind'],sorted(p['name'] for p in x['people'])) for x in d['queue'] if x['postId']=='$P1']")"
check "far-away offer has no match" "[('match', [])]" "$(q $P2)"
P4=$(post ann ask "Tech & skills" "Help with my tablet" "Waltham" "Greater Boston")
P5=$(post cat offer "Tech & skills" "Video call tech help" "Denver" "North America")
check "remote-friendly help crosses regions" "['Cat C.']" "$(tr "[p['name'] for x in d['queue'] if x['postId']=='$P4' for p in x['people'] if p['name']=='Cat C.']")"
check "complement explained" True "$(j "any('Offering this' in r for x in d['queue'] for p in x['people'] for r in p['reasons'])")"
check "far match flagged as remote" True "$(j "any('remote' in r for x in d['queue'] for p in x['people'] if p['name']=='Cat C.' for r in p['reasons'])")"
check "offer matched to the asker only" "[('match', ['Ann A.'])]" "$(q $P5)"
sql "UPDATE help_posts SET status='in-progress' WHERE id='$P4'"
check "a request with a helper isn't a match" "[('match', [])]" "$(q $P5)"
sql "DELETE FROM help_posts WHERE id IN ('$P4','$P5')"
check "last names shortened" True "$(j "'Baker' not in json.dumps(d)")"
check "no emails" True "$(j "'@' not in json.dumps(d)")"
req ann POST blocks "{\"userId\":\"$DOT\"}" >/dev/null
check "blocked members never matched" False "$(tr "'Dot D.' in json.dumps(d)")"
req bob PATCH me '{"suggestions":false}' >/dev/null
check "opt-out saved" False "$(j "d['user']['suggestions']")"
check "opted-out member never matched" False "$(tr "'Bob B.' in json.dumps(d)")"
req bob PATCH me '{"suggestions":true}' >/dev/null
sql "UPDATE users SET suspended_at=1 WHERE id='$CAT'"
check "suspended member and their post gone" False "$(tr "'Cat C.' in json.dumps(d)")"
sql "UPDATE users SET suspended_at=NULL WHERE id='$CAT'"
sql "UPDATE help_posts SET location='12 Oak Street' WHERE id='$P1'"
check "street address not shown" False "$(tr "'Oak' in json.dumps(d)")"
sql "UPDATE help_posts SET location='Waltham' WHERE id='$P1'"
sql "UPDATE help_posts SET hidden_at=1 WHERE id='$P2'"
check "hidden post left out" "[]" "$(q $P2)"
sql "UPDATE help_posts SET hidden_at=NULL WHERE id='$P2'"
PA=$(post adm ask "Pets & animals" "Founder post" "Waltham" "Greater Boston")
check "admin posts left out" "[]" "$(q $PA)"
check "and disclosed" 1 "$(j "d['excluded']['posts']")"

echo "== suggestions"
check "needs someone" 400 $(req adm POST admin/nudges "{\"kind\":\"match\",\"postId\":\"$P1\",\"userIds\":[]}")
check "bad kind" 400 $(nudge spam $P1 $BOB)
check "can't message someone unmatched" 409 $(nudge match $P1 $DOT)
check "can't message the poster" 409 $(nudge match $P1 $ANN)
check "unknown post" 409 $(nudge match nope $BOB)
check "sent" 201 $(nudge match $P1 $BOB)
req bob GET notifications >/dev/null
check "member notified without naming anyone" "('nudge', 'match_ask', None)" "$(j "[(n['type'],n['detail'],n['actor']) for n in d['notifications'] if n['type']=='nudge'][0]")"
check "not twice" 409 $(nudge match $P1 $BOB)
P3=$(post ann ask "Moving & heavy lifting" "Move a sofa" "Waltham" "Greater Boston")
check "one invitation a week" 409 $(nudge match $P3 $BOB)
check "shown as resting" "[True]" "$(tr "[p['resting'] for x in d['queue'] if x['postId']=='$P3' for p in x['people'] if p['name']=='Bob B.']")"
check "sent, not acted on yet" "[('match', 1, 0, 0)]" "$(tr "[(n['kind'],n['sent'],n['seen'],n['acted']) for n in d['nudges']]")"
req bob POST notifications/read '{"all":true}' >/dev/null
check "bob replies" 200 $(req bob POST "help/$P1/replies" '{"text":"I can do Tuesdays"}')
check "seen and acted" "[('match', 1, 1, 1)]" "$(tr "[(n['kind'],n['sent'],n['seen'],n['acted']) for n in d['nudges']]")"
check "replied post leaves the queue" "[]" "$(q $P1)"
sql "UPDATE help_replies SET created_at=created_at-3*86400000 WHERE post_id='$P1'"
check "stalled talk appears, helper named" "[('commit', ['Bob B.'])]" "$(q $P1)"
check "reminder sent" 201 $(nudge commit $P1 $BOB)
check "reminder to the poster refused" 409 $(nudge commit $P1 $ANN)
sql "UPDATE help_replies SET status='committed', committed_at=(SELECT MAX(created_at)+1000 FROM nudges) WHERE post_id='$P1'; UPDATE help_posts SET status='in-progress' WHERE id='$P1'"
check "commitment credited" 1 "$(tr "[n['acted'] for n in d['nudges'] if n['kind']=='commit'][0]")"
check "fresh commitment isn't nagged" "[]" "$(q $P1)"
sql "UPDATE help_replies SET committed_at=committed_at-4*86400000 WHERE post_id='$P1'"
check "old commitment needs confirming by poster" "[('finish', ['Ann A.'])]" "$(q $P1)"
check "poster reminded" 201 $(nudge finish $P1 $ANN)
check "poster completes" 200 $(req ann POST "help/$P1/complete" '{}')
check "completion credited" 1 "$(tr "[n['acted'] for n in d['nudges'] if n['kind']=='finish'][0]")"
check "audit trail" 200 $(req adm GET admin/overview)

echo "== numbers"
check "one neighbor helped" "(1, 1)" "$(tr "(d['totals']['completed'],d['totals']['replies'])")"
check "funnel is nested" "{'members': 5, 'acted': 3, 'connected': 2, 'committed': 2, 'helped': 2}" "$(j "d['funnel']")"
req bob POST "help/$PA/replies" '{"text":"Happy to help"}' >/dev/null
check "reply to an admin isn't counted" 1 "$(tr "d['totals']['replies']")"
check "but is disclosed" 1 "$(j "d['excluded']['replies']")"
check "twelve weeks, sums match" "(12, 5)" "$(j "(len(d['weeks']),sum(w['signups'] for w in d['weeks']))")"
check "demand by category" True "$(j "[(x['asks'],x['offers']) for x in d['demand'] if x['category'].startswith('Groceries')]==[(1,1)]")"

echo "== sprint"
NOW=$(python3 -c "import time;print(int(time.time()*1000))"); ST=$((NOW-86400000)); EN=$((NOW+6*86400000))
check "end before start" 400 $(req adm POST admin/sprint "{\"name\":\"S\",\"startsAt\":$EN,\"endsAt\":$ST,\"goals\":{\"visits\":5}}")
check "needs a goal" 400 $(req adm POST admin/sprint "{\"name\":\"S\",\"startsAt\":$ST,\"endsAt\":$EN,\"goals\":{\"nope\":5}}")
check "saved" 200 $(req adm POST admin/sprint "{\"name\":\"Class sprint\",\"startsAt\":$ST,\"endsAt\":$EN,\"goals\":{\"signups\":10,\"completed\":3,\"visits\":0}}")
check "only real goals kept" "{'signups': 10, 'completed': 3}" "$(tr "d['sprint']['goals']")"
sql "UPDATE users SET created_at=created_at-36*3600000 WHERE id IN ('$CAT','$DOT')"
check "before and after split" "(3, 2)" "$(tr "(d['current']['signups'],d['previous']['signups'])")"
check "window starts with sprint" True "$(j "d['window']['from']==$ST")"
check "edits replace it" 200 $(req adm POST admin/sprint "{\"name\":\"Class sprint 2\",\"startsAt\":$ST,\"endsAt\":$EN,\"goals\":{\"signups\":12}}")
check "one sprint" "Class sprint 2" "$(tr "d['sprint']['name']")"

echo "== campaigns"
camp(){ req adm POST admin/campaigns "{\"tag\":\"$1\",\"name\":\"Flyer\",\"audience\":\"${2:-elder}\",\"benefit\":\"${3:-named-yes}\",\"channel\":\"flyer\",\"place\":\"Waltham\",\"headline\":\"Need a ride?\",\"body\":\"B\",\"cta\":\"Ask\"}"; }
check "bad tag" 400 $(camp 'Bad Tag')
check "bad audience" 400 $(camp ok-tag kids)
check "bad benefit" 400 $(camp ok-tag elder free-money)
check "created" 201 $(camp flyer-elder); CID=$(j "d['campaign']['id']")
check "tag reused" 409 $(camp flyer-elder)
check "second benefit" 201 $(camp flyer-priv elder private)
vid(){ python3 -c "import secrets;print(secrets.token_hex(16))"; }
land(){ curl -s -o /dev/null -H 'Content-Type: application/json' -H "Origin: $B" --data "{\"vid\":\"$1\",\"experiment\":\"solo-b\",\"device\":\"mobile\",\"source\":\"$2\"$3}" "$B/api/landing"; }
V1=$(vid); V2=$(vid); V3=$(vid)
land $V1 flyer-elder; land $V1 flyer-elder ',"event":"cta:elder"'; land $V2 flyer-elder; land $V3 poster
check "visits and clicks per asset" "(2, 1, 0.5)" "$(tr "[(c['visits'],c['click']['count'],c['click']['rate']) for c in d['campaigns'] if c['tag']=='flyer-elder'][0]")"
check "untracked tag listed apart" "['poster']" "$(j "[u['source'] for u in d['untracked']]")"
check "benefits compared" "[('named-yes', 2), ('private', 0)]" "$(j "[(b['benefit'],b['visits']) for b in d['benefits']]")"
check "audience clicks" "[('cta:elder', 1)]" "$(j "[(c['event'],c['n']) for c in d['landingClicks']]")"
check "archive" 200 $(req adm POST "admin/campaigns/$CID" '{"action":"archive"}')
check "archived keeps its results" "(True, 2)" "$(tr "[(c['archived'],c['visits']) for c in d['campaigns'] if c['tag']=='flyer-elder'][0]")"
check "restore" 200 $(req adm POST "admin/campaigns/$CID" '{"action":"restore"}')
check "delete isn't offered" 400 $(req adm POST "admin/campaigns/$CID" '{"action":"delete"}')
check "missing asset" 404 $(req adm POST admin/campaigns/nope '{"action":"archive"}')

echo "== files"
check "dashboard script served" 200 $(curl -s -o $T/tx.js -w '%{http_code}' "$B/traction.js")
check "members' page doesn't include it" 0 "$(curl -s "$B/" | grep -c '<script src="/traction')"
check "category map matches the app" True "$(python3 - "$PROJ" <<'P'
import re,sys
a=open(sys.argv[1]+'/public/index.html').read(); b=open(sys.argv[1]+'/functions/api/[[path]].js').read()
f=lambda s,n: re.sub(r'\s','',re.search(n+r' = (\{.*?\n *\});',s,re.S).group(1))
print(f(a,'HELP_CATS')==f(b,'CAT_CAUSES'))
P
)"
check "benefit and audience lists match the API" True "$(python3 - "$PROJ" <<'P'
import re,sys
a=open(sys.argv[1]+'/public/traction-assets.js').read(); b=open(sys.argv[1]+'/functions/api/[[path]].js').read()
lst=lambda n:set(re.findall(r"'([^']+)'",re.search(n+r' = \[(.*?)\]',b).group(1)))
print(set(re.findall(r"^    '([a-z-]+)':\{ name",a,re.M))==lst('CAMPAIGN_BENEFITS') and set(re.findall(r"(\w+):\['[A-Z]",re.search(r'CHANNELS = (.*)',a).group(1)))==lst('CAMPAIGN_CHANNELS'))
P
)"
check "deleting an account removes its suggestions" 200 $(req bob DELETE me '{"password":"test password 123"}')
check "gone" "[('finish', 1)]" "$(tr "[(n['kind'],n['sent']) for n in d['nudges']]")"
finish
