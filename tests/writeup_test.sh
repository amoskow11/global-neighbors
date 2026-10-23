#!/bin/bash
# Changes from Traction Write-up #2: categories, notifications, feedback, guest stats, shorter sign-up.
# Usage: tests/writeup_test.sh <base-url>
B="${1:-http://127.0.0.1:8788}"; PROJ="$(cd "$(dirname "$0")/.." && pwd)"
source "$(dirname "$0")/lib.sh"
post(){ req $1 POST help "{\"type\":\"ask\",\"category\":\"$2\",\"categoryNote\":\"$3\",\"scale\":\"Neighborhood\",\"title\":\"$4\",\"detail\":\"d\",\"location\":\"Waltham\",\"region\":\"Greater Boston\",\"payKind\":\"volunteer\",\"urgency\":\"Ongoing\"}"; }

echo "== shorter sign-up"
check "sign-up without location" 201 $(req a POST auth/signup "{\"accountType\":\"person\",\"displayName\":\"Ava $S\",\"email\":\"ava$S@example.com\",\"password\":\"test password 123\",\"acceptTerms\":true}")
check "location empty" "" "$(j "d['user']['location']")"
check "region defaults" "Greater Boston" "$(j "d['user']['region']")"
check "profile saves with empty location" 200 $(req a PATCH me '{"location":"","headline":"Student"}')
check "signup helper" 201 $(signup h person "Hal $S" "hal$S@example.com")
check "signup org" 201 $(signup o org "Waltham Org $S" "worg$S@example.com")

echo "== categories"
check "new category accepted" 201 $(post a "Pets & animals" "" "Dog walking $S")
check "another new category" 201 $(post a "Emotional support & wellbeing" "" "Someone to talk to $S")
check "Other needs a topic" 400 $(post a "Other" "" "Untitled $S")
check "Other with topic" 201 $(post a "Other" "Bike repair" "Fix my bike $S"); PO=$(j "d['post']['id']")
check "topic returned" "Bike repair" "$(j "d['post']['categoryNote']")"
check "topic too long rejected" 400 $(post a "Other" "$(printf 'x%.0s' {1..41})" "Long $S")
check "note ignored for normal categories" "" "$(post a "Food & meals" "ignored" "Meals $S" >/dev/null; j "d['post']['categoryNote']")"
check "unknown category rejected" 400 $(post a "Underwater basket weaving" "" "Nope $S")

echo "== notifications"
check "no notifications yet" 0 "$(req a GET notifications >/dev/null; j "d['unread']")"
check "guests can't read notifications" 401 $(req nobody GET notifications)
check "helper replies" 200 $(req h POST help/$PO/replies '{"text":"I fix bikes"}'); R=$(j "d['post']['replies'][0]['id']")
check "author notified of reply" "reply" "$(req a GET notifications >/dev/null; j "d['notifications'][0]['type']")"
check "notice names the replier" "Hal $S" "$(j "d['notifications'][0]['actor']['name']")"
check "notice carries post title" "Fix my bike $S" "$(j "d['notifications'][0]['postTitle']")"
check "unread count" 1 "$(j "d['unread']")"
NID=$(j "d['notifications'][0]['id']")
check "helper commits" 200 $(req h POST replies/$R/commit '{}')
check "poster notified of commitment" "committed" "$(req a GET notifications >/dev/null; j "d['notifications'][0]['type']")"
check "message 1" 200 $(req a POST replies/$R/messages '{"text":"Saturday?"}')
check "message 2" 200 $(req a POST replies/$R/messages '{"text":"Around 10am"}')
check "messages collapse into one unread notice" 1 "$(req h GET notifications >/dev/null; j "len([n for n in d['notifications'] if n['type']=='message' and not n['read']])")"
check "no self-notifications" 0 "$(req a GET notifications >/dev/null; j "len([n for n in d['notifications'] if n['type']=='message'])")"
check "helper not notified of own commit" 0 "$(req h GET notifications >/dev/null; j "len([n for n in d['notifications'] if n['type']=='committed'])")"
check "mark one read" 1 "$(req a POST notifications/read "{\"ids\":[\"$NID\"]}" >/dev/null; j "d['unread']")"
check "can't mark others' notices" 1 "$(req h POST notifications/read "{\"ids\":[\"$NID\"]}" >/dev/null; j "d['unread']")"
check "mark all read" 0 "$(req h POST notifications/read '{"all":true}' >/dev/null; j "d['unread']")"
UH=$(req h GET me >/dev/null; j "d['user']['id']")
check "message after block" 200 $(req h POST replies/$R/messages '{"text":"See you"}')
check "A blocks H" 200 $(req a POST blocks "{\"userId\":\"$UH\"}")
check "blocked member's notices hidden" 0 "$(req a GET notifications >/dev/null; j "len([n for n in d['notifications'] if n['actor'] and n['actor']['id']=='$UH'])")"
req a DELETE blocks/$UH >/dev/null

echo "== moderation & verification notices"
check "signup admin" 201 $(signup m person "Notice Admin $S" "noticeadmin$S@example.com")
sql "UPDATE users SET is_admin=1 WHERE email='noticeadmin$S@example.com'"
check "admin hides post" 200 $(req m POST admin/posts/$PO '{"action":"hide"}')
check "author told post was hidden" "post_hidden" "$(req a GET notifications >/dev/null; j "d['notifications'][0]['type']")"
check "org requests verification" 200 $(req o POST me/verification '{"legalName":"Waltham Org Inc","registrationNumber":"EIN 00-0000000","country":"US","contactRole":"Director"}')
VID=$(req m GET admin/verifications >/dev/null; j "[v for v in d['verifications'] if v['org']['email']=='worg$S@example.com'][0]['id']")
check "admin approves" 200 $(req m POST admin/verifications/$VID '{"decision":"approve"}')
check "org told it's verified" "verification:approved" "$(req o GET notifications >/dev/null; j "d['notifications'][0]['type']+':'+d['notifications'][0]['detail']")"

echo "== feedback"
check "guest feedback" 201 $(req nobody POST feedback "{\"kind\":\"category\",\"message\":\"Please add a category for bike repair $S\",\"contactEmail\":\"guest$S@example.com\",\"page\":\"help (guest)\"}")
check "member feedback" 201 $(req a POST feedback '{"kind":"idea","message":"Notifications are great","page":"help"}')
check "empty feedback rejected" 400 $(req a POST feedback '{"kind":"idea","message":"   "}')
check "bad kind rejected" 400 $(req a POST feedback '{"kind":"rant","message":"x"}')
check "bad guest email rejected" 400 $(req nobody POST feedback '{"kind":"other","message":"x","contactEmail":"not-an-email"}')
check "admin notified of feedback" "feedback" "$(req m GET notifications >/dev/null; j "d['notifications'][0]['type']")"
check "non-admin can't read feedback" 403 $(req a GET admin/feedback)
check "admin inbox" True "$(req m GET 'admin/feedback?status=new' >/dev/null; j "any(f['message']=='Please add a category for bike repair $S' and f['from'] is None and f['contactEmail']=='guest$S@example.com' for f in d['feedback'])")"
FID=$(j "[f['id'] for f in d['feedback'] if f['message']=='Please add a category for bike repair $S'][0]")
check "member feedback shows sender" True "$(j "any(f['from'] and f['from']['name']=='Ava $S' for f in d['feedback'])")"
check "overview counts new feedback" True "$(req m GET admin/overview >/dev/null; j "d['newFeedback']>=2")"
check "mark done" 200 $(req m POST admin/feedback/$FID '{"status":"done"}')
check "leaves the new list" False "$(req m GET 'admin/feedback?status=new' >/dev/null; j "any(f['id']=='$FID' for f in d['feedback'])")"
check "unknown feedback 404" 404 $(req m POST admin/feedback/nope '{"status":"done"}')

echo "== public stats for guests"
check "stats public" 200 $(req nobody GET stats)
check "stats are counts only" "['members', 'openPosts', 'orgs', 'postsThisWeek', 'repliesThisWeek']" "$(j "sorted(d.keys())")"
check "hidden post not counted as open" True "$(j "d['openPosts']>=4")"

echo "== deletion"
check "A deletes account" 200 $(req a DELETE me '{"password":"test password 123"}')
check "A's notices to others gone" 0 "$(req h GET notifications >/dev/null; j "len([n for n in d['notifications'] if n['actor'] and n['actor']['name']=='Ava $S'])")"
finish
