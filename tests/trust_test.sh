#!/bin/bash
# Trust & safety checks. Usage: tests/trust_test.sh <base-url> <noemail|devlog> [dev-server-log]
#   noemail — server running without email configured
#   devlog  — server running with RESEND_API_KEY=dev-log (emails printed to the log file given as $3)
B="${1:-http://127.0.0.1:8788}"; MODE="${2:-noemail}"; LOG="$3"; PROJ="$(cd "$(dirname "$0")/.." && pwd)"
source "$(dirname "$0")/lib.sh"
post(){ req $1 POST help "{\"type\":\"ask\",\"category\":\"Groceries & errands\",\"scale\":\"Neighborhood\",\"title\":\"$2\",\"detail\":\"details\",\"location\":\"Boston\",\"region\":\"Greater Boston\",\"payKind\":\"volunteer\",\"urgency\":\"Ongoing\"}"; }
# Newest $1 link (verify|reset) emailed to address $2.
lastlink(){ awk -v to="to=$2" -v kind="#/$1/" 'index($0,"[dev email]"){cur=index($0,to)>0} cur && (i=index($0,kind)){print substr($0,i+length(kind))}' "$LOG" | grep -o '^[A-Za-z0-9_-]*' | tail -1; }

echo "== config & terms ($MODE)"
req anon GET config >/dev/null; check "emailEnabled flag" "$([ $MODE == devlog ] && echo True || echo False)" "$(j "d['emailEnabled']")"
check "contact email exposed" "amoskow@brandeis.edu" "$(j "d['contactEmail']")"
check "signup without terms rejected" 400 $(req x POST auth/signup "{\"accountType\":\"person\",\"displayName\":\"X\",\"email\":\"noterms$S@example.com\",\"password\":\"test password 123\",\"location\":\"B\",\"region\":\"Greater Boston\"}")
check "signup A" 201 $(signup a person "Alice $S" "alice$S@example.com")
[ $MODE == devlog ] && check "verification email sent" True "$(j "d['verificationSent']")"
check "signup B" 201 $(signup b person "Bob $S" "bob$S@example.com")
check "signup C" 201 $(signup c person "Cara $S" "cara$S@example.com")
check "signup org" 201 $(signup o org "Helping Org $S" "org$S@example.com")
check "signup admin" 201 $(signup m person "Admin $S" "admin$S@example.com")
PW="test password 123"

if [ $MODE == devlog ]; then
  echo "== email verification"
  check "unverified can't post" 403 $(post a "Before verify")
  sleep 1; TOK=$(lastlink verify alice$S@example.com)
  check "resend verification" 200 $(req a POST auth/verify/send '{}')
  sleep 1; TOK2=$(lastlink verify alice$S@example.com)
  check "old verify link invalidated" 400 $(req anon POST auth/verify "{\"token\":\"$TOK\"}")
  check "verify with new link" 200 $(req anon POST auth/verify "{\"token\":\"$TOK2\"}")
  check "verify link single-use" 400 $(req anon POST auth/verify "{\"token\":\"$TOK2\"}")
  check "me shows verified" True "$(req a GET me >/dev/null; j "d['user']['emailVerified']")"
  sql "UPDATE users SET email_verified_at=1 WHERE email IN ('bob$S@example.com','cara$S@example.com','org$S@example.com','admin$S@example.com')"
  echo "== forgot / reset by email"
  check "forgot unknown email same response" 200 $(req x POST auth/forgot "{\"email\":\"nobody$S@example.com\"}")
  check "forgot known email" 200 $(req x POST auth/forgot "{\"email\":\"alice$S@example.com\"}")
  sleep 1; RT=$(lastlink reset alice$S@example.com)
  check "reset rejects short password" 400 $(req x POST auth/reset "{\"token\":\"$RT\",\"password\":\"short\"}")
  check "reset with emailed link" 200 $(req a3 POST auth/reset "{\"token\":\"$RT\",\"password\":\"brand new pass 1\"}")
  check "old session signed out by reset" None "$(req a GET me >/dev/null; j "d['user']")"
  check "reset link single-use" 400 $(req x POST auth/reset "{\"token\":\"$RT\",\"password\":\"another pass 22\"}")
  check "login with new password" 200 $(req a POST auth/login "{\"email\":\"alice$S@example.com\",\"password\":\"brand new pass 1\"}")
  PW="brand new pass 1"
else
  check "forgot explains email is off" 400 $(req x POST auth/forgot "{\"email\":\"alice$S@example.com\"}")
  check "forgot message has contact" True "$(j "'amoskow@brandeis.edu' in d['error']")"
fi

echo "== posts, reports"
check "A posts" 201 $(post a "Alice needs groceries $S"); PA=$(j "d['post']['id']")
check "B replies" 200 $(req b POST help/$PA/replies '{"text":"I can help"}'); RB=$(j "d['post']['replies'][0]['id']")
check "B reports post" 201 $(req b POST reports "{\"targetType\":\"post\",\"targetId\":\"$PA\",\"reason\":\"Scam or fraud\",\"details\":\"asked for gift cards\"}")
check "bad reason rejected" 400 $(req b POST reports "{\"targetType\":\"post\",\"targetId\":\"$PA\",\"reason\":\"Nope\"}")
check "can't report own post" 400 $(req a POST reports "{\"targetType\":\"post\",\"targetId\":\"$PA\",\"reason\":\"Spam\"}")
check "non-participant can't report reply" 403 $(req c POST reports "{\"targetType\":\"reply\",\"targetId\":\"$RB\",\"reason\":\"Spam\"}")
check "A reports B's reply" 201 $(req a POST reports "{\"targetType\":\"reply\",\"targetId\":\"$RB\",\"reason\":\"Harassment or hate\"}")
UA=$(req a GET me >/dev/null; j "d['user']['id']"); UB=$(req b GET me >/dev/null; j "d['user']['id']")
check "report user" 201 $(req c POST reports "{\"targetType\":\"user\",\"targetId\":\"$UA\",\"reason\":\"Impersonation or fake organization\"}")

echo "== blocks"
check "can't block self" 400 $(req b POST blocks "{\"userId\":\"$UB\"}")
check "B blocks A" 200 $(req b POST blocks "{\"userId\":\"$UA\"}")
check "A's post hidden from B" False "$(req b GET 'help?view=browse' >/dev/null; j "any(p['id']=='$PA' for p in d['posts'])")"
check "B hidden from A's replies" 0 "$(req a GET help/$PA >/dev/null; j "len(d['post']['replies'])")"
check "A can't message B" 403 $(req a POST replies/$RB/messages '{"text":"hey"}')
check "A can't view B's profile" 404 $(req a GET users/$UB)
check "block list" "['Alice $S']" "$(req b GET blocks >/dev/null; j "[x['displayName'] for x in d['blocks']]")"
check "B unblocks A" 200 $(req b DELETE blocks/$UA)
check "post visible again" True "$(req b GET 'help?view=browse' >/dev/null; j "any(p['id']=='$PA' for p in d['posts'])")"

echo "== admin"
check "non-admin blocked from admin" 403 $(req b GET admin/overview)
sql "UPDATE users SET is_admin=1 WHERE email='admin$S@example.com'"
check "admin overview" 200 $(req m GET admin/overview)
check "open reports listed" True "$(req m GET admin/reports >/dev/null; j "len([r for r in d['reports'] if r['targetId']=='$PA'])>=1")"
REP=$(j "[r for r in d['reports'] if r['targetId']=='$PA'][0]['id']")
check "snapshot captured" True "$(j "[r for r in d['reports'] if r['targetId']=='$PA'][0]['snapshot'].startswith('Alice needs groceries')")"
check "admin hides post" 200 $(req m POST admin/reports/$REP '{"action":"hide-post","note":"looks like a scam"}')
check "hidden post gone for C" 404 $(req c GET help/$PA)
check "author still sees it, flagged hidden" True "$(req a GET help/$PA >/dev/null; j "d['post']['hidden']")"
check "can't reply to hidden post" 404 $(req c POST help/$PA/replies '{"text":"hi"}')
check "admin unhides post" 200 $(req m POST admin/posts/$PA '{"action":"unhide"}')
check "visible again for C" 200 $(req c GET help/$PA)
REPU=$(req m GET admin/reports >/dev/null; j "[r for r in d['reports'] if r['targetType']=='user' and r['targetId']=='$UA'][0]['id']")
check "admin suspends via report" 200 $(req m POST admin/reports/$REPU '{"action":"suspend-user"}')
check "suspended session ended" None "$(req a GET me >/dev/null; j "d['user']")"
check "suspended can't log in" 403 $(req a POST auth/login "{\"email\":\"alice$S@example.com\",\"password\":\"$PW\"}")
check "suspended user's posts hidden" False "$(req c GET 'help?view=browse' >/dev/null; j "any(p['id']=='$PA' for p in d['posts'])")"
check "admin unsuspends" 200 $(req m POST admin/users/$UA '{"action":"unsuspend"}')
check "can log in again" 200 $(req a POST auth/login "{\"email\":\"alice$S@example.com\",\"password\":\"$PW\"}")
UM=$(req m GET me >/dev/null; j "d['user']['id']")
check "admin can't suspend admin" 400 $(req m POST admin/users/$UM '{"action":"suspend"}')
check "admin makes reset link" 200 $(req m POST admin/users/$UB '{"action":"reset-link"}'); LINK=$(j "d['link']"); TOKB=${LINK##*/}
check "reset via admin link" 200 $(req b2 POST auth/reset "{\"token\":\"$TOKB\",\"password\":\"bobs new password\"}")
check "admin user search" True "$(req m GET "admin/users?q=bob$S" >/dev/null; j "[u['email'] for u in d['users']]==['bob$S@example.com']")"
check "search escapes wildcards" 0 "$(req m GET "admin/users?q=%25%25zz$S" >/dev/null; j "len(d['users'])")"

echo "== org verification"
check "person can't request" 400 $(req c POST me/verification '{"legalName":"x","registrationNumber":"1","country":"US","contactRole":"x"}')
check "org requests verification" 200 $(req o POST me/verification '{"legalName":"Helping Org Inc.","registrationNumber":"EIN 12-3456789","country":"United States","website":"helping.example.org","contactRole":"Director"}')
check "status pending" pending "$(j "d['verification']['status']")"
check "duplicate request" 409 $(req o POST me/verification '{"legalName":"x","registrationNumber":"1","country":"US","contactRole":"x"}')
VID=$(req m GET admin/verifications >/dev/null; j "[v for v in d['verifications'] if v['org']['email']=='org$S@example.com'][0]['id']")
check "reject needs a note" 400 $(req m POST admin/verifications/$VID '{"decision":"reject"}')
check "admin approves" 200 $(req m POST admin/verifications/$VID '{"decision":"approve"}')
check "can't review twice" 409 $(req m POST admin/verifications/$VID '{"decision":"reject","note":"x"}')
check "org shows verified publicly" True "$(req anon GET orgs >/dev/null; j "[o['verified'] for o in d['orgs'] if o['displayName']=='Helping Org $S'][0]")"
check "rename clears badge" True "$(req o PATCH me '{"displayName":"Renamed Org '$S'"}' >/dev/null; j "d['verificationReset'] and d['user']['verificationStatus']=='none'")"

echo "== audit log & deletion"
(cd "$PROJ" && npx -y wrangler d1 execute global-neighbors-db ${D1FLAG:---local} --json --command "SELECT COUNT(*) AS n FROM admin_actions WHERE admin_id='$UM'" 2>/dev/null) > $T/body
check "admin actions logged (6)" 6 "$(python3 -c "import json;print(json.load(open('$T/body'))[0]['results'][0]['n'])")"
check "B deletes account" 200 $(req b2 DELETE me '{"password":"bobs new password"}')
check "blocks cleaned up" 0 "$(req a GET blocks >/dev/null; j "len(d['blocks'])")"
finish
