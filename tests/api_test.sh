#!/bin/bash
# Core accounts + Help Board checks. Usage: tests/api_test.sh <base-url>   (run with email off)
B="${1:-http://127.0.0.1:8788}"; PROJ="$(cd "$(dirname "$0")/.." && pwd)"
source "$(dirname "$0")/lib.sh"

echo "== auth"
check "me when logged out" 200 $(req anon GET me); check "me is null" None "$(j "d['user']")"
check "signup person" 201 $(req a POST auth/signup "{\"accountType\":\"person\",\"displayName\":\"Margaret O.\",\"email\":\"Margaret$S@Example.com\",\"password\":\"correct horse battery\",\"location\":\"Dorchester, Boston\",\"region\":\"Greater Boston\",\"acceptTerms\":true}")
check "email lowercased" "margaret$S@example.com" "$(j "d['user']['email']")"
check "no password hash leaked" False "$(j "'password_hash' in json.dumps(d) or 'pbkdf2' in json.dumps(d)")"
grep -qi 'httponly' $T/a && check "session cookie HttpOnly" yes yes || check "session cookie HttpOnly" yes no
check "duplicate email" 409 $(signup x person "X" "margaret$S@example.com")
check "short password rejected" 400 $(req x POST auth/signup "{\"accountType\":\"person\",\"displayName\":\"X\",\"email\":\"x$S@example.com\",\"password\":\"short\",\"location\":\"B\",\"region\":\"Greater Boston\",\"acceptTerms\":true}")
check "bad region rejected" 400 $(req x POST auth/signup "{\"accountType\":\"person\",\"displayName\":\"X\",\"email\":\"x$S@example.com\",\"password\":\"correct horse battery\",\"location\":\"B\",\"region\":\"Mars\",\"acceptTerms\":true}")
check "signup org" 201 $(signup o org "Fields Corner Errands $S" "org$S@example.com")
check "signup helper" 201 $(signup h person "Leo T." "leo$S@example.com")
check "signup stranger" 201 $(signup s person "Stranger" "s$S@example.com")
check "wrong password" 401 $(req x POST auth/login "{\"email\":\"margaret$S@example.com\",\"password\":\"wrong password!\"}")
check "unknown email same error" 401 $(req x POST auth/login "{\"email\":\"nobody$S@example.com\",\"password\":\"wrong password!\"}")
check "login ok (case-insensitive email)" 200 $(req a2 POST auth/login "{\"email\":\"MARGARET$S@example.com\",\"password\":\"correct horse battery\"}")

echo "== CSRF"
check "cross-origin POST blocked" 403 $(curl -s -o /dev/null -w '%{http_code}' -b $T/a -X POST -H 'Content-Type: application/json' -H 'Origin: https://evil.example' --data '{}' "$B/api/auth/logout")
check "form-encoded POST blocked" 415 $(curl -s -o /dev/null -w '%{http_code}' -b $T/a -X POST -H 'Content-Type: application/x-www-form-urlencoded' --data 'a=b' "$B/api/help")

echo "== profile"
check "update org profile" 200 $(req o PATCH me '{"headline":"Grocery runs for elders","bio":"We drive.","website":"fieldscorner.example.org","causes":["Elder Care","Food Security","Not A Cause"]}')
check "website normalized" "https://fieldscorner.example.org/" "$(j "d['user']['website']")"
check "unknown cause dropped" "['Elder Care', 'Food Security']" "$(j "d['user']['causes']")"
check "javascript: website rejected" 400 $(req o PATCH me '{"website":"javascript:alert(1)"}')
check "org listed publicly" True "$(req anon GET orgs >/dev/null; j "any(o['displayName']=='Fields Corner Errands $S' for o in d['orgs'])")"
check "org list hides email" False "$(j "'email' in json.dumps(d)")"

echo "== help board"
check "help requires login" 401 $(req anon GET help)
check "create post" 201 $(req a POST help '{"type":"ask","category":"Groceries & errands","scale":"Neighborhood","title":"Weekly grocery run","detail":"Thursdays, about an hour.","location":"Dorchester","region":"Greater Boston","payKind":"volunteer","payLabel":"","urgency":"Ongoing"}')
P=$(j "d['post']['id']")
check "bad category rejected" 400 $(req a POST help '{"type":"ask","category":"Nope","scale":"Neighborhood","title":"x","detail":"y","location":"z","region":"Greater Boston","payKind":"volunteer","urgency":"Ongoing"}')
check "markup stored as text" 201 $(req a POST help '{"type":"offer","category":"Tech & skills","scale":"Remote","title":"<img src=x onerror=alert(1)>","detail":"d","location":"z","region":"Global","payKind":"paid","payLabel":"$20/hr","urgency":"Flexible"}')
P2=$(j "d['post']['id']")
check "helper sees post in browse" True "$(req h GET 'help?view=browse' >/dev/null; j "any(p['id']=='$P' for p in d['posts'])")"
check "author can't reply to own post" 400 $(req a POST help/$P/replies '{"text":"me"}')
check "helper replies" 200 $(req h POST help/$P/replies '{"text":"I have a car, happy to help"}')
R=$(j "d['post']['replies'][0]['id']")
check "duplicate reply" 409 $(req h POST help/$P/replies '{"text":"again"}')
check "org replies" 200 $(req o POST help/$P/replies '{"text":"We can add you to our route"}')
check "org sees only its own reply" 1 "$(j "len(d['post']['replies'])")"
check "author sees both replies" 2 "$(req a GET help/$P >/dev/null; j "len(d['post']['replies'])")"
check "stranger sees no replies" 0 "$(req s GET help/$P >/dev/null; j "len(d['post']['replies'])")"
check "stranger can't accept reply" 403 $(req s PATCH replies/$R '{"status":"accepted"}')
check "helper can't accept own reply" 403 $(req h PATCH replies/$R '{"status":"accepted"}')
check "author accepts" 200 $(req a PATCH replies/$R '{"status":"accepted"}')
check "post now in-progress" in-progress "$(j "d['post']['status']")"
check "author messages" 200 $(req a POST replies/$R/messages '{"text":"Thursday at 2?"}')
check "helper messages" 200 $(req h POST replies/$R/messages '{"text":"See you then"}')
check "helper sees thread" 2 "$(j "len(d['post']['replies'][0]['messages'])")"
check "stranger can't message" 403 $(req s POST replies/$R/messages '{"text":"hi"}')
check "helping view" True "$(req h GET 'help?view=helping' >/dev/null; j "[p['id'] for p in d['posts']]==['$P']")"
check "mine view" 2 "$(req a GET 'help?view=mine' >/dev/null; j "len(d['posts'])")"
check "stranger can't resolve" 403 $(req s PATCH help/$P '{"status":"resolved"}')
check "author resolves" 200 $(req a PATCH help/$P '{"status":"resolved"}')
check "no messages after resolve" 400 $(req h POST replies/$R/messages '{"text":"late"}')
check "stranger can't delete" 403 $(req s DELETE help/$P2)
check "author deletes post" 200 $(req a DELETE help/$P2)
check "deleted post gone" 404 $(req a GET help/$P2)

echo "== person profiles"
UID_A=$(req a GET me >/dev/null; j "d['user']['id']")
check "person profile hidden from public" 404 $(req anon GET users/$UID_A)
check "person profile visible to members" 200 $(req h GET users/$UID_A)

echo "== password & sessions"
check "change password wrong current" 403 $(req a POST me/password '{"currentPassword":"nope nope nope","newPassword":"brand new password"}')
check "change password" 200 $(req a POST me/password '{"currentPassword":"correct horse battery","newPassword":"brand new password"}')
check "other session signed out" None "$(req a2 GET me >/dev/null; j "d['user']")"
check "current session kept" "Margaret O." "$(req a GET me >/dev/null; j "d['user']['displayName']")"
check "logout" 200 $(req a POST auth/logout '{}')
check "logged out" None "$(req a GET me >/dev/null; j "d['user']")"

echo "== rate limit"
for i in $(seq 1 8); do req x POST auth/login "{\"email\":\"leo$S@example.com\",\"password\":\"wrong wrong wrong\"}" >/dev/null; done
check "locked after 8 failures" 429 $(req x POST auth/login "{\"email\":\"leo$S@example.com\",\"password\":\"test password 123\"}")

echo "== delete account"
req a3 POST auth/login "{\"email\":\"margaret$S@example.com\",\"password\":\"brand new password\"}" >/dev/null
check "delete needs password" 403 $(req a3 DELETE me '{"password":"wrong"}')
check "delete account" 200 $(req a3 DELETE me '{"password":"brand new password"}')
check "her post is gone" 404 $(req h GET help/$P)
check "helper's helping list cleaned" 0 "$(req h GET 'help?view=helping' >/dev/null; j "len(d['posts'])")"
check "can't log in after delete" 401 $(req x2 POST auth/login "{\"email\":\"margaret$S@example.com\",\"password\":\"brand new password\"}")
finish
