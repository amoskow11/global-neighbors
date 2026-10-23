#!/bin/bash
# Commitments, multi-helper posts, and ratings. Usage: tests/commit_test.sh <base-url>
B="${1:-http://127.0.0.1:8788}"; PROJ="$(cd "$(dirname "$0")/.." && pwd)"
source "$(dirname "$0")/lib.sh"
post(){ req $1 POST help "{\"type\":\"$2\",\"helpersNeeded\":$3,\"category\":\"Moving & heavy lifting\",\"scale\":\"Neighborhood\",\"title\":\"$4\",\"detail\":\"d\",\"location\":\"Waltham\",\"region\":\"Greater Boston\",\"payKind\":\"volunteer\",\"urgency\":\"Ongoing\"}"; }
reply(){ req $1 POST help/$2/replies '{"text":"Happy to help"}' >/dev/null; j "[r['id'] for r in d['post']['replies'] if r['isMine']][0]"; }
uid(){ req $1 GET me >/dev/null; j "d['user']['id']"; }

echo "== setup"
for who in p:Pat h1:Hana h2:Hugo h3:Hiro h4:Hazel r1:Rosa r2:Ravi s:Sam m:Mod; do
  jar=${who%%:*}; name=${who##*:}
  check "signup $name" 201 $(signup $jar person "$name Tester$S" "$jar.c$S@example.com")
done
check "signup offering org" 201 $(signup o org "Offer Org $S" "offerorg.c$S@example.com")
UP=$(uid p); UH1=$(uid h1)

echo "== 1. full ask flow (1 helper)"
check "helpers 0 rejected" 400 $(post p ask 0 "Bad $S")
check "helpers 21 rejected" 400 $(post p ask 21 "Bad $S")
check "helpers 2.5 rejected" 400 $(post p ask 2.5 "Bad $S")
check "ask posted" 201 $(post p ask 1 "Move a couch $S"); A1=$(j "d['post']['id']")
check "defaults: open, 1 needed" "open 1 1" "$(j "d['post']['status']+' '+str(d['post']['helpersNeeded'])+' '+str(d['post']['spotsLeft'])")"
R11=$(reply h1 $A1)
check "reply is talking, post open" "talking open" "$(req h1 GET help/$A1 >/dev/null; j "d['post']['replies'][0]['status']+' '+d['post']['status']")"
check "poster can't commit on an ask" 403 $(req p POST replies/$R11/commit '{}')
check "stranger can't commit" 403 $(req s POST replies/$R11/commit '{}')
check "helper commits" 200 $(req h1 POST replies/$R11/commit '{}')
check "in progress and full" "in-progress True 0" "$(j "d['post']['status']+' '+str(d['post']['full'])+' '+str(d['post']['spotsLeft'])")"
check "committing twice" 409 $(req h1 POST replies/$R11/commit '{}')
R12=$(reply h2 $A1)
check "late helper sees it's full" True "$(req h2 GET help/$A1 >/dev/null; j "d['post']['full']")"
check "full post rejects commit" 409 $(req h2 POST replies/$R12/commit '{}')
check "can still message on a full post" 200 $(req h2 POST replies/$R12/messages '{"text":"Ping me if a spot opens"}')
check "poster can't decline a committed helper" 409 $(req p POST replies/$R11/decline '{}')
check "rating before completion" 400 $(req p POST replies/$R11/rating '{"stars":5}')
check "stranger can't complete" 403 $(req s POST help/$A1/complete '{}')
check "poster completes" 200 $(req p POST help/$A1/complete '{}')
check "post resolved, helper completed" "resolved completed" "$(j "d['post']['status']+' '+[r['status'] for r in d['post']['replies'] if r['id']=='$R11'][0]")"
check "talking reply untouched" talking "$(j "[r['status'] for r in d['post']['replies'] if r['id']=='$R12'][0]")"
check "helper told to rate" completed "$(req h1 GET notifications >/dev/null; j "d['notifications'][0]['type']")"
check "rating is due for poster" 1 "$(req p GET 'help?view=mine' >/dev/null; j "[x['ratingsDue'] for x in d['posts'] if x['id']=='$A1'][0]")"
check "6 stars rejected" 400 $(req p POST replies/$R11/rating '{"stars":6}')
check "0 stars rejected" 400 $(req p POST replies/$R11/rating '{"stars":0}')
check "281-char comment rejected" 400 $(req p POST replies/$R11/rating "{\"stars\":5,\"comment\":\"$(printf 'x%.0s' {1..281})\"}")
check "stranger can't rate" 403 $(req s POST replies/$R11/rating '{"stars":1}')
check "uncommitted replier can't rate" 400 $(req h2 POST replies/$R12/rating '{"stars":1}')
check "poster rates helper" 200 $(req p POST replies/$R11/rating '{"stars":5}')
check "only once" 409 $(req p POST replies/$R11/rating '{"stars":4}')
check "helper rates poster" 200 $(req h1 POST replies/$R11/rating '{"stars":4,"comment":"Clear instructions, very kind"}')
check "poster told about rating" rated "$(req p GET notifications >/dev/null; j "d['notifications'][0]['type']")"
check "no ratings due anymore" 0 "$(req p GET 'help?view=mine' >/dev/null; j "[x['ratingsDue'] for x in d['posts'] if x['id']=='$A1'][0]")"
check "helper's rating on profile" "5.0 1" "$(req s GET users/$UH1 >/dev/null; j "'%.1f %d' % (d['user']['rating']['avg'], d['user']['rating']['count'])")"
check "poster's rating comment shown" "Clear instructions, very kind" "$(req s GET users/$UP >/dev/null; j "d['ratings'][0]['comment']")"
check "rater shown by short name" "Hana T." "$(j "d['ratings'][0]['from']")"
RATING=$(j "d['ratings'][0]['id']")
check "rating next to names in replies" 1 "$(req p GET help/$A1 >/dev/null; j "[r['user']['rating']['count'] for r in d['post']['replies'] if r['id']=='$R11'][0]")"

echo "== 2. full offer flow (poster is the helper)"
check "offer posted (2 people)" 201 $(post o offer 2 "Bike repair lessons $S"); O1=$(j "d['post']['id']")
RO1=$(reply r1 $O1)
check "requester can't commit on an offer" 403 $(req r1 POST replies/$RO1/commit '{}')
check "offerer commits to request" 200 $(req o POST replies/$RO1/commit '{}')
check "1 of 2 spots" "in-progress 1 False" "$(j "d['post']['status']+' '+str(d['post']['spotsLeft'])+' '+str(d['post']['full'])")"
check "requester notified" committed "$(req r1 GET notifications >/dev/null; j "d['notifications'][0]['type']")"
check "requester cancels" 200 $(req r1 POST replies/$RO1/withdraw '{}')
check "spot reopens, post open" "open 2" "$(j "d['post']['status']+' '+str(d['post']['spotsLeft'])")"
check "withdrawn conversation closed" 400 $(req r1 POST replies/$RO1/messages '{"text":"wait"}')
check "can't recommit a withdrawn reply" 409 $(req o POST replies/$RO1/commit '{}')
check "can't reply twice" 409 $(req r1 POST help/$O1/replies '{"text":"again"}')
RO2=$(reply r2 $O1)
check "offerer declines" 200 $(req o POST replies/$RO2/decline '{}')
check "declined conversation closed" 400 $(req r2 POST replies/$RO2/messages '{"text":"why"}')
check "declined can't be committed" 409 $(req o POST replies/$RO2/commit '{}')
check "requester can't decline" 403 $(req r2 POST replies/$RO2/decline '{}')

echo "== 3. three-helper ask: commit, withdraw, refill, complete, rate"
check "3-helper ask" 201 $(post p ask 3 "Community garden cleanup $S"); M1=$(j "d['post']['id']")
RM1=$(reply h1 $M1); RM2=$(reply h2 $M1); RM3=$(reply h3 $M1); RM4=$(reply h4 $M1)
check "h1 commits" 200 $(req h1 POST replies/$RM1/commit '{}')
check "1 of 3" "1 2" "$(j "str(d['post']['committedCount'])+' '+str(d['post']['spotsLeft'])")"
check "poster lowers to 2" 200 $(req p PATCH help/$M1 '{"helpersNeeded":2}')
check "poster raises back to 3" 200 $(req p PATCH help/$M1 '{"helpersNeeded":3}')
check "h2 commits" 200 $(req h2 POST replies/$RM2/commit '{}')
check "h3 commits" 200 $(req h3 POST replies/$RM3/commit '{}')
check "full at 3 of 3" "True 0 3" "$(j "str(d['post']['full'])+' '+str(d['post']['spotsLeft'])+' '+str(d['post']['committedCount'])")"
check "h4 can't overfill" 409 $(req h4 POST replies/$RM4/commit '{}')
check "h4 can still message" 200 $(req h4 POST replies/$RM4/messages '{"text":"I can be a backup"}')
check "can't lower below committed" 409 $(req p PATCH help/$M1 '{"helpersNeeded":2}')
check "non-poster can't change count" 403 $(req h1 PATCH help/$M1 '{"helpersNeeded":5}')
check "helpers see each other by short name" "['Hugo T.', 'Hiro T.']" "$(req h1 GET help/$M1 >/dev/null; j "[t['name'] for t in d['post']['committed'] if not t['isMe']]")"
check "helpers don't get ids or ratings" False "$(j "any('id' in t or 'rating' in t for t in d['post']['committed'])")"
check "helpers can't see others' conversations" 1 "$(j "len(d['post']['replies'])")"
check "poster sees full names and ratings" True "$(req p GET help/$M1 >/dev/null; j "all('rating' in t and 'Tester' in t['name'] for t in d['post']['committed'])")"
check "outsider sees no team" 0 "$(req s GET help/$M1 >/dev/null; j "len(d['post']['committed'])")"
check "h2 backs out" 200 $(req h2 POST replies/$RM2/withdraw '{}')
check "spot reopens" "False 1" "$(j "str(d['post']['full'])+' '+str(d['post']['spotsLeft'])")"
check "poster told h2 backed out" "withdrawn:backed_out" "$(req p GET notifications >/dev/null; j "d['notifications'][0]['type']+':'+d['notifications'][0]['detail']")"
check "h4 fills the spot" 200 $(req h4 POST replies/$RM4/commit '{}')
check "full again" True "$(j "d['post']['full']")"
check "poster releases h3" 200 $(req p POST replies/$RM3/withdraw '{}')
check "h3 told they were released" "withdrawn:released" "$(req h3 GET notifications >/dev/null; j "d['notifications'][0]['type']+':'+d['notifications'][0]['detail']")"
check "2 of 3 after release" "2 1" "$(req p GET help/$M1 >/dev/null; j "str(d['post']['committedCount'])+' '+str(d['post']['spotsLeft'])")"
check "outsider can't send team update" 403 $(req s POST help/$M1/update '{"text":"hi"}')
check "poster sends update to team" 2 "$(req p POST help/$M1/update '{"text":"Meet at 10am by the gate"}' >/dev/null; j "d['sent']")"
check "update lands in each conversation" "Meet at 10am by the gate" "$(req h4 GET help/$M1 >/dev/null; j "d['post']['replies'][0]['messages'][-1]['text']")"
check "released helper didn't get it" False "$(req h3 GET help/$M1 >/dev/null; j "any(m['text']=='Meet at 10am by the gate' for m in d['post']['replies'][0]['messages'])")"
check "poster completes" 200 $(req p POST help/$M1/complete '{}')
check "committed → completed, withdrawn stay" "['completed', 'withdrawn', 'withdrawn', 'completed']" "$(j "[r['status'] for r in d['post']['replies']]")"
check "can't complete twice" 400 $(req p POST help/$M1/complete '{}')
check "can't commit after completion" 400 $(req h3 POST replies/$RM3/commit '{}')
check "can't change count after completion" 400 $(req p PATCH help/$M1 '{"helpersNeeded":4}')
check "poster rates h1" 200 $(req p POST replies/$RM1/rating '{"stars":5}')
check "poster rates h4" 200 $(req p POST replies/$RM4/rating '{"stars":4}')
check "h1 rates poster" 200 $(req h1 POST replies/$RM1/rating '{"stars":5}')
check "h4 rates poster" 200 $(req h4 POST replies/$RM4/rating '{"stars":5}')
check "helpers can't rate each other" 403 $(req h1 POST replies/$RM4/rating '{"stars":1}')
check "withdrawn helper can't rate" 400 $(req h2 POST replies/$RM2/rating '{"stars":1}')
check "poster's average" "4.7 3" "$(req s GET users/$UP >/dev/null; j "'%.1f %d' % (d['user']['rating']['avg'], d['user']['rating']['count'])")"

echo "== 4. two people race for the last spot"
check "1-helper ask" 201 $(post p ask 1 "Race $S"); RC=$(j "d['post']['id']")
RA=$(reply h1 $RC); RB=$(reply h2 $RC)
curl -s -o /dev/null -w '%{http_code}\n' -b $T/h1 -X POST -H 'Content-Type: application/json' -H "Origin: $B" --data '{}' "$B/api/replies/$RA/commit" > $T/race1 &
curl -s -o /dev/null -w '%{http_code}\n' -b $T/h2 -X POST -H 'Content-Type: application/json' -H "Origin: $B" --data '{}' "$B/api/replies/$RB/commit" > $T/race2 &
wait
check "exactly one commit wins" "200 409" "$(cat $T/race1 $T/race2 | sort | tr '\n' ' ' | sed 's/ $//')"
check "never overfilled" 1 "$(req p GET help/$RC >/dev/null; j "d['post']['committedCount']")"

echo "== 5. reporting & hiding ratings"
check "rating can be reported" 201 $(req s POST reports "{\"targetType\":\"rating\",\"targetId\":\"$RATING\",\"reason\":\"Inappropriate content\"}")
sql "UPDATE users SET is_admin=1 WHERE email='m.c$S@example.com'"
REP=$(req m GET admin/reports >/dev/null; j "[r['id'] for r in d['reports'] if r['targetId']=='$RATING'][0]")
check "snapshot has the comment" True "$(j "'Clear instructions' in [r['snapshot'] for r in d['reports'] if r['targetId']=='$RATING'][0]")"
check "admin hides rating" 200 $(req m POST admin/reports/$REP '{"action":"hide-rating"}')
check "hidden rating leaves average" "5.0 2" "$(req s GET users/$UP >/dev/null; j "'%.1f %d' % (d['user']['rating']['avg'], d['user']['rating']['count'])")"
check "hidden rating leaves profile" False "$(j "any(g['id']=='$RATING' for g in d['ratings'])")"
check "admin can unhide" 200 $(req m POST admin/ratings/$RATING '{"action":"unhide"}')
check "back in the average" 3 "$(req s GET users/$UP >/dev/null; j "d['user']['rating']['count']")"
check "non-admin can't hide" 403 $(req s POST admin/ratings/$RATING '{"action":"hide"}')

echo "== 6. analytics & deletion"
(cd "$PROJ" && npx -y wrangler d1 execute global-neighbors-db ${D1FLAG:---local} --json --command "SELECT feature, COUNT(*) n FROM activity_events WHERE user_id IN ('$UP','$UH1') AND feature IN ('commit','complete','rating') GROUP BY feature ORDER BY feature" 2>/dev/null) > $T/ev.json
check "commit/complete/rating logged" "['commit', 'complete', 'rating']" "$(python3 -c "import json;print([r['feature'] for r in json.load(open('$T/ev.json'))[0]['results']])")"
check "h4 deletes account" 200 $(req h4 DELETE me '{"password":"test password 123"}')
check "their ratings leave averages" 2 "$(req s GET users/$UP >/dev/null; j "d['user']['rating']['count']")"
check "poster deletes a completed post" 200 $(req p DELETE help/$M1)
check "ratings survive post deletion" 2 "$(req s GET users/$UP >/dev/null; j "d['user']['rating']['count']")"
finish
