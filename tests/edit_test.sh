#!/bin/bash
# Editing posts after publishing, and scheduling (date/time). Usage: tests/edit_test.sh <base-url>
B="${1:-http://127.0.0.1:8788}"; PROJ="$(cd "$(dirname "$0")/.." && pwd)"
source "$(dirname "$0")/lib.sh"
day(){ python3 -c "import datetime,sys; print((datetime.date.today()+datetime.timedelta(days=int(sys.argv[1]))).isoformat())" "$1"; }
post(){ req p POST help "{\"type\":\"ask\",\"helpersNeeded\":2,\"category\":\"Moving & heavy lifting\",\"scale\":\"Neighborhood\",\"title\":\"$1\",\"detail\":\"d\",\"location\":\"Waltham, MA\",\"region\":\"Greater Boston\",\"payKind\":\"volunteer\",\"urgency\":\"This week\"$2}"; }
D3=$(day 3); D5=$(day 5)

echo "== setup"
check "signup poster" 201 $(signup p person "Edie Poster$S" "edie.e$S@example.com")
check "signup helper" 201 $(signup h person "Hank Helper$S" "hank.e$S@example.com")
check "signup stranger" 201 $(signup s person "Stan Stranger$S" "stan.e$S@example.com")
check "signup admin" 201 $(signup m person "Mo Admin$S" "mo.e$S@example.com")

echo "== scheduling on create"
check "post with date and time" 201 $(post "Move boxes $S" ",\"whenDate\":\"$D3\",\"whenTime\":\"10:30\""); P=$(j "d['post']['id']")
check "date and time returned" "$D3 10:30" "$(j "d['post']['whenDate']+' '+d['post']['whenTime']")"
check "not edited yet" None "$(j "d['post']['editedAt']")"
check "invalid month" 400 $(post "x" ',"whenDate":"2027-13-01"')
check "impossible day" 400 $(post "x" ',"whenDate":"2027-02-30"')
check "past date on create" 400 $(post "x" ',"whenDate":"2020-01-01"')
check "too far ahead" 400 $(post "x" ",\"whenDate\":\"$(day 900)\"")
check "bad time" 400 $(post "x" ",\"whenDate\":\"$D3\",\"whenTime\":\"25:00\"")
check "time without date" 400 $(post "x" ',"whenTime":"10:00"')
check "no date is fine" 201 $(post "Undated $S" ""); PU=$(j "d['post']['id']")
check "undated has null date" None "$(j "d['post']['whenDate']")"
check "listing carries dates" "$D3" "$(req h GET 'help?view=browse' >/dev/null; j "[x['whenDate'] for x in d['posts'] if x['id']=='$P'][0]")"

echo "== who can edit"
check "guest can't edit" 401 $(req nobody PATCH help/$P '{"title":"hijack"}')
check "stranger can't edit" 403 $(req s PATCH help/$P '{"title":"hijack"}')
check "empty title rejected" 400 $(req p PATCH help/$P '{"title":"  "}')

echo "== editing every field"
check "edit everything" 200 $(req p PATCH help/$P "{\"title\":\"Move boxes and a desk $S\",\"detail\":\"Second floor, no elevator\",\"category\":\"Other\",\"categoryNote\":\"Furniture assembly\",\"location\":\"Newton, MA\",\"region\":\"Greater Boston\",\"scale\":\"City\",\"urgency\":\"Urgent\",\"payKind\":\"paid\",\"payLabel\":\"\$25/hr\",\"whenDate\":\"$D5\",\"whenTime\":\"09:00\"}")
check "all fields saved" "Move boxes and a desk $S|Second floor, no elevator|Other|Furniture assembly|Newton, MA|City|Urgent|paid|\$25/hr|$D5|09:00" "$(j "'|'.join([d['post'][k] for k in ('title','detail','category','categoryNote','location','scale','urgency')]+[d['post']['pay']['kind'],d['post']['pay']['label'],d['post']['whenDate'],d['post']['whenTime']])")"
EDITED=$(j "d['post']['editedAt']")
check "marked edited" True "$(j "d['post']['editedAt'] is not None")"
sleep 1
check "unchanged resave" 200 $(req p PATCH help/$P "{\"title\":\"Move boxes and a desk $S\",\"urgency\":\"Urgent\",\"whenDate\":\"$D5\"}")
check "unchanged resave doesn't touch editedAt" "$EDITED" "$(j "d['post']['editedAt']")"
check "Other needs a topic" 400 $(req p PATCH help/$P '{"categoryNote":""}')
check "back to a normal category clears topic" "Moving & heavy lifting|" "$(req p PATCH help/$P '{"category":"Moving & heavy lifting"}' >/dev/null; j "d['post']['category']+'|'+d['post']['categoryNote']")"
check "clear the date" "None None" "$(req p PATCH help/$P '{"whenDate":"","whenTime":""}' >/dev/null; j "str(d['post']['whenDate'])+' '+str(d['post']['whenTime'])")"
check "can't edit to a past date" 400 $(req p PATCH help/$P '{"whenDate":"2020-01-01"}')

echo "== switching ask/offer"
check "switch to offer before replies" offer "$(req p PATCH help/$PU '{"type":"offer"}' >/dev/null; j "d['post']['type']")"
check "and back" ask "$(req p PATCH help/$PU '{"type":"ask"}' >/dev/null; j "d['post']['type']")"
check "helper replies" 200 $(req h POST help/$P/replies '{"text":"I can help"}'); R=$(j "d['post']['replies'][0]['id']")
check "no switching after replies" 409 $(req p PATCH help/$P '{"type":"offer"}')

echo "== participants hear about edits"
check "poster edits" 200 $(req p PATCH help/$P '{"detail":"Bring gloves"}')
check "helper notified" post_edited "$(req h GET notifications >/dev/null; j "d['notifications'][0]['type']")"
check "second edit" 200 $(req p PATCH help/$P '{"detail":"Bring gloves and water"}')
check "edits collapse to one unread notice" 1 "$(req h GET notifications >/dev/null; j "len([n for n in d['notifications'] if n['type']=='post_edited' and not n['read']])")"
check "helper sees new text" "Bring gloves and water" "$(req h GET help/$P >/dev/null; j "d['post']['detail']")"

echo "== helper counts"
check "helper commits" 200 $(req h POST replies/$R/commit '{}')
check "raise needed with other edits" 200 $(req p PATCH help/$P "{\"helpersNeeded\":3,\"title\":\"Bigger move $S\"}")
check "raised to 3, title saved" "3 Bigger move $S" "$(j "str(d['post']['helpersNeeded'])+' '+d['post']['title']")"
check "second helper replies" 200 $(req s POST help/$P/replies '{"text":"Me too"}'); R2=$(j "[r['id'] for r in d['post']['replies'] if r['isMine']][0]")
check "second helper commits" 200 $(req s POST replies/$R2/commit '{}')
check "can't go below committed (2)" 409 $(req p PATCH help/$P "{\"helpersNeeded\":1,\"title\":\"Should not save $S\"}")
check "rejected edit changes nothing" "Bigger move $S 3" "$(req p GET help/$P >/dev/null; j "d['post']['title']+' '+str(d['post']['helpersNeeded'])")"
BEFORE=$(j "d['post']['editedAt']"); sleep 1
check "helpers-only change" 200 $(req p PATCH help/$P '{"helpersNeeded":4}')
check "helpers-only isn't an edit" "$BEFORE" "$(j "d['post']['editedAt']")"

echo "== past dates, completion, moderation"
sql "UPDATE help_posts SET when_date='2020-05-05' WHERE id='$P'"
check "editing other fields keeps an old date" 200 $(req p PATCH help/$P '{"title":"Kept old date"}')
check "old date kept" 2020-05-05 "$(j "d['post']['whenDate']")"
check "complete" 200 $(req p POST help/$P/complete '{}')
check "wording edits allowed after completion" 200 $(req p PATCH help/$P '{"title":"Done: big move"}')
check "no helper changes after completion" 400 $(req p PATCH help/$P '{"helpersNeeded":5}')
check "no type change after completion" 400 $(req p PATCH help/$P '{"type":"offer"}')
sql "UPDATE users SET is_admin=1 WHERE email='mo.e$S@example.com'"
check "admin hides undated post" 200 $(req m POST admin/posts/$PU '{"action":"hide"}')
check "author edits hidden post" 200 $(req p PATCH help/$PU '{"title":"Edited while hidden"}')
check "still hidden" True "$(j "d['post']['hidden']")"
check "still invisible to others" 404 $(req s GET help/$PU)
finish
