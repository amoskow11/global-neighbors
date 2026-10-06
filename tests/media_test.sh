#!/bin/bash
# Profile photos, banners & profile fields. Usage: tests/media_test.sh <base-url>
B="${1:-http://127.0.0.1:8788}"; PROJ="$(cd "$(dirname "$0")/.." && pwd)"
source "$(dirname "$0")/lib.sh"
reqf(){ curl -s -o $T/body -w '%{http_code}' -b $T/$1 -c $T/$1 -X POST -H 'Content-Type: application/json' -H "Origin: $B" --data @"$3" "$B/api/$2"; }
get(){ curl -s -o $T/img -w '%{http_code}' -b $T/$1 "$B$2"; }
hdr(){ curl -s -o /dev/null -D - -b $T/$1 "$B$2" | tr -d '\r' | grep -i "^$3:" | cut -d' ' -f2-; }
j(){ python3 -c "import json,sys; d=json.load(open('$T/body')); print(eval(sys.argv[1]))" "$1"; }
sql(){ (cd "$PROJ" && npx -y wrangler d1 execute global-neighbors-db $D1FLAG --command "$1" >/dev/null 2>&1); }
signup(){ req $1 POST auth/signup "{\"accountType\":\"$2\",\"displayName\":\"$3\",\"email\":\"$4\",\"password\":\"test password 123\",\"location\":\"Boston\",\"region\":\"Greater Boston\",\"acceptTerms\":true}"; }
# payload <file> <mime> <bytes> <magic-hex>
payload(){ python3 - "$1" "$2" "$3" "$4" <<'PY'
import sys, os, base64, json
f, mime, n, magic = sys.argv[1], sys.argv[2], int(sys.argv[3]), bytes.fromhex(sys.argv[4])
data = magic + os.urandom(max(0, n - len(magic)))
open(f, 'w').write(json.dumps({'dataUrl': f'data:{mime};base64,' + base64.b64encode(data).decode()}))
PY
}
payload $T/jpg.json image/jpeg 20000 ffd8ffe0
payload $T/jpg2.json image/jpeg 22000 ffd8ffe1
payload $T/banner.json image/jpeg 300000 ffd8ffe0
payload $T/big.json image/jpeg 320000 ffd8ffe0
payload $T/fakepng.json image/png 5000 ffd8ffe0
payload $T/huge.json image/jpeg 1300000 ffd8ffe0
echo '{"dataUrl":"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="}' > $T/svg.json

echo "== setup"
check "signup person P" 201 $(signup p person "Pat $S" "pat$S@example.com")
check "signup person Q" 201 $(signup q person "Quinn $S" "quinn$S@example.com")
check "signup org O" 201 $(signup o org "Org $S" "morg$S@example.com")
check "signup admin" 201 $(signup m person "Mod $S" "mod$S@example.com")
UP=$(req p GET me >/dev/null; j "d['user']['id']"); UQ=$(req q GET me >/dev/null; j "d['user']['id']")

echo "== uploads"
check "upload needs login" 401 $(reqf anon me/media/avatar $T/jpg.json)
check "svg rejected" 400 $(reqf p me/media/avatar $T/svg.json)
check "type/content mismatch rejected" 400 $(reqf p me/media/avatar $T/fakepng.json)
check "oversize avatar rejected" 413 $(reqf p me/media/avatar $T/big.json)
check "oversize body rejected" 413 $(reqf p me/media/banner $T/huge.json)
check "bad kind 404" 404 $(reqf p me/media/cover $T/jpg.json)
check "avatar upload" 200 $(reqf p me/media/avatar $T/jpg.json); AV1=$(j "d['user']['avatarUrl']")
check "avatar url set" True "$(j "d['user']['avatarUrl'].startswith('/api/media/')")"
check "owner can load avatar" 200 $(get p $AV1)
check "served as jpeg" "image/jpeg" "$(hdr p $AV1 content-type)"
check "nosniff header" "nosniff" "$(hdr p $AV1 x-content-type-options)"
check "sandbox CSP" "default-src 'none'; sandbox" "$(hdr p $AV1 content-security-policy)"
check "bytes round-trip" 20000 "$(wc -c < $T/img | tr -d ' ')"
check "person avatar hidden from guests" 404 $(get anon $AV1)
check "person avatar visible to members" 200 $(get q $AV1)
check "private cache for person" "private, max-age=86400" "$(hdr q $AV1 cache-control)"
check "replace avatar" 200 $(reqf p me/media/avatar $T/jpg2.json); AV2=$(j "d['user']['avatarUrl']")
check "old avatar deleted" 404 $(get p $AV1)
check "banner upload" 200 $(reqf p me/media/banner $T/banner.json); BN=$(j "d['user']['bannerUrl']")
check "remove banner" 200 $(req p DELETE me/media/banner); check "banner cleared" None "$(j "d['user']['bannerUrl']")"
check "removed banner gone" 404 $(get p $BN)
check "org logo upload" 200 $(reqf o me/media/avatar $T/jpg.json); OAV=$(j "d['user']['avatarUrl']")
check "org logo public" 200 $(get anon $OAV)
check "public cache for org" "public, max-age=86400" "$(hdr anon $OAV cache-control)"
check "org list carries logo" True "$(req anon GET orgs >/dev/null; j "[o['avatarUrl'] for o in d['orgs'] if o['displayName']=='Org $S'][0]=='$OAV'")"

echo "== blocking hides photos"
check "Q blocks P" 200 $(req q POST blocks "{\"userId\":\"$UP\"}")
check "blocked member can't load avatar" 404 $(get q $AV2)
check "unblock" 200 $(req q DELETE blocks/$UP)

echo "== profile fields"
check "save fields" 200 $(req p PATCH me '{"pronouns":"they/them","languages":["English","Spanish","English"],"skills":["Driving","Tutoring"],"bannerPreset":"dusk"}')
check "languages deduped" "['English', 'Spanish']" "$(j "d['user']['languages']")"
check "preset saved" dusk "$(j "d['user']['bannerPreset']")"
check "pronouns saved" "they/them" "$(j "d['user']['pronouns']")"
check "bad preset rejected" 400 $(req p PATCH me '{"bannerPreset":"plaid"}')
check "too many skills rejected" 400 $(req p PATCH me '{"skills":["1","2","3","4","5","6","7","8","9","10","11"]}')
check "long language rejected" 400 $(req p PATCH me "{\"languages\":[\"$(printf 'x%.0s' {1..31})\"]}")
check "public profile has fields" "they/them" "$(req q GET users/$UP >/dev/null; j "d['user']['pronouns']")"
check "profile hides email" False "$(j "'email' in d['user']")"

echo "== avatars on posts & replies"
check "P posts" 201 $(req p POST help '{"type":"ask","category":"Food & meals","scale":"City","title":"Need dinner help","detail":"d","location":"Boston","region":"Greater Boston","payKind":"volunteer","urgency":"Ongoing"}'); PID=$(j "d['post']['id']")
check "author avatar on post" True "$(j "d['post']['author']['avatarUrl']=='$AV2'")"
check "Q replies" 200 $(req q POST help/$PID/replies '{"text":"I can cook"}')
check "org replies" 200 $(req o POST help/$PID/replies '{"text":"We deliver meals"}')
check "reply avatar for author view" True "$(req p GET help/$PID >/dev/null; j "[r['user']['avatarUrl'] for r in d['post']['replies'] if r['user']['accountType']=='org'][0]=='$OAV'")"

echo "== admin removal & deletion"
sql "UPDATE users SET is_admin=1 WHERE email='mod$S@example.com'"
check "admin sees person avatar" 200 $(get m $AV2)
check "admin removes avatar" 200 $(req m POST admin/users/$UP '{"action":"remove-avatar"}')
check "avatar cleared" None "$(req p GET me >/dev/null; j "d['user']['avatarUrl']")"
check "removed avatar gone" 404 $(get p $AV2)
check "non-admin can't remove" 403 $(req q POST admin/users/$UP '{"action":"remove-banner"}')
check "org deletes account" 200 $(req o DELETE me '{"password":"test password 123"}')
check "deleted org's logo gone" 404 $(get anon $OAV)
check "invalid media id" 404 $(get anon /api/media/not-a-real-id)

finish
