#!/bin/bash
# Landing page A/B test: counting, conversions, and the admin verdict. Usage: tests/landing_test.sh <base-url>
# Verdict checks seed synthetic visitors, so this suite only runs against a LOCAL database.
B="${1:-http://127.0.0.1:8788}"; PROJ="$(cd "$(dirname "$0")/.." && pwd)"
source "$(dirname "$0")/lib.sh"
if [ "$D1FLAG" == "--remote" ]; then echo "landing_test seeds and clears results; local only"; exit 1; fi
vid(){ python3 -c "import secrets;print('$1'+secrets.token_hex(16)[1:])"; }
hit(){ req $1 POST landing "{\"vid\":\"$2\",\"experiment\":\"${5:-vp1}\",\"device\":\"mobile\",\"source\":\"${4:-}\"${3:+,\"event\":\"$3\"}}"; }
res(){ req m GET 'admin/landing?experiment=vp1' >/dev/null; j "$1"; }
wipe(){ sql "DELETE FROM landing_events; DELETE FROM landing_visitors"; }
# seed <A visitors> <A clicks> <B visitors> <B clicks>
seed(){ wipe; sql "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<2000)
  INSERT INTO landing_visitors SELECT 'vp1', 'A'||i, 'A', '', 'desktop', 1 FROM n WHERE i<=$1 UNION ALL SELECT 'vp1', 'B'||i, 'B', '', 'desktop', 1 FROM n WHERE i<=$3;
  WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<2000)
  INSERT INTO landing_events SELECT 'vp1', 'A'||i, 'cta:hero-person', 1 FROM n WHERE i<=$2 UNION ALL SELECT 'vp1', 'B'||i, 'cta:hero-person', 1 FROM n WHERE i<=$4"; }
wipe

echo "== page"
check "page served" 200 $(curl -s -o $T/page -w '%{http_code}' "$B/start")
check "both versions in page" 2 "$(grep -c '<h1>' $T/page)"
check "every button is a known event" True "$(python3 - "$T/page" "$PROJ/functions/api/[[path]].js" <<'P'
import re,sys
ev=set(re.findall(r'data-cta="([^"]+)"',open(sys.argv[1]).read()))
api=set(re.findall(r"'([^']+)'",re.search(r'LANDING_EVENTS = \[(.*?)\]',open(sys.argv[2]).read()).group(1)))
print(ev|{'scroll'}==api)
P
)"

echo "== counting"
check "signup admin" 201 $(signup m person "Land Admin $S" "landadmin$S@example.com")
sql "UPDATE users SET is_admin=1 WHERE email='landadmin$S@example.com'"
check "guests can't read results" 401 $(req nobody GET admin/landing)
VA=$(vid 4); VB=$(vid b)
check "bad id rejected" 400 $(hit anon nope)
check "unknown event rejected" 400 $(hit anon $VA "cta:nope")
check "form-encoded blocked" 415 $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: text/plain' --data '{}' "$B/api/landing")
check "A visit" 200 $(hit anon $VA "" flyer)
check "even digit is A" A "$(j "d['variant']")"
check "B visit" 200 $(hit anon $VB "" '<script>')
check "odd digit is B" B "$(j "d['variant']")"
hit anon $VA >/dev/null; hit anon $VA cta:hero-person >/dev/null; hit anon $VA cta:hero-person >/dev/null; hit anon $VA cta:elder >/dev/null; hit anon $VB guest >/dev/null
check "repeat visits count once" "(1, 1)" "$(res "(d['a']['visitors'],d['b']['visitors'])")"
check "several clicks count once per person" 1 "$(j "d['a']['cta']['count']")"
check "guest look isn't a sign-up click" "(0, 1)" "$(j "(d['b']['cta']['count'],d['b']['guests'])")"
check "buttons broken out" "cta:elder=1 cta:hero-person=1" "$(j "' '.join(sorted(p['event']+'='+str(p['a']) for p in d['places']))")"
check "source kept, unsafe source dropped" "['', 'flyer']" "$(j "sorted(s['source'] for s in d['sources'])")"
check "old experiment ignored" False "$(hit anon $(vid 2) "" "" vp0 >/dev/null; j "d['counted']")"
check "signed-in visitor ignored" False "$(hit m $(vid 2) >/dev/null; j "d['counted']")"
BOT="{\"vid\":\"$(vid 2)\",\"experiment\":\"vp1\"}"
curl -s -o $T/body -A 'Googlebot/2.1' -H 'Content-Type: application/json' --data "$BOT" "$B/api/landing"
check "bot ignored" False "$(j "d['counted']")"
check "ignored visits added nothing" "(1, 1)" "$(res "(d['a']['visitors'],d['b']['visitors'])")"

echo "== one version for everyone"
V1=$(vid 4); V2=$(vid b)
check "even digit still gets B" B "$(hit anon $V1 "" "" solo-b >/dev/null; j "d['variant']")"
check "odd digit gets B" B "$(hit anon $V2 cta:hero-person "" solo-b >/dev/null; j "d['variant']")"
req m GET admin/landing >/dev/null
check "page and API agree on the active mode" True "$(grep -q "EXP = '$(j "d['experiment']")', ONLY = '$(j "d['only'] or ''")'" $T/page && echo True)"
check "solo counted, no verdict" "(0, 2, 1, None)" "$(j "(d['a']['visitors'],d['b']['visitors'],d['b']['cta']['count'],d['test'])")"
check "split test data unaffected" "(1, 1)" "$(res "(d['a']['visitors'],d['b']['visitors'])")"
req anon POST auth/signup "{\"accountType\":\"person\",\"displayName\":\"LP $S\",\"email\":\"lpsolo$S@example.com\",\"password\":\"test password 123\",\"region\":\"Greater Boston\",\"acceptTerms\":true,\"landingId\":\"$V2\"}" >/dev/null
req m GET admin/landing >/dev/null
check "solo sign-up credited" 1 "$(j "d['b']['signup']['count']")"

echo "== sign-ups"
su(){ req $1 POST auth/signup "{\"accountType\":\"$2\",\"displayName\":\"LP $S\",\"email\":\"$3$S@example.com\",\"password\":\"test password 123\",\"region\":\"Greater Boston\",\"acceptTerms\":true,\"landingId\":$4}"; }
check "org signs up from B" 201 $(su s1 org lpa "\"$VB\"")
check "credited to B" "(0, 1, 1)" "$(res "(d['a']['signup']['count'],d['b']['signup']['count'],d['b']['orgSignups'])")"
check "second account, same browser" 201 $(su s2 org lpb "\"$VB\"")
check "counts the person once" 1 "$(res "d['b']['signup']['count']")"
check "unknown id still signs up" 201 $(su s3 person lpc "\"$(vid 1)\"")
check "junk id still signs up" 201 $(su s4 person lpd '{"x":1}')
check "neither was credited" "(0, 1)" "$(res "(d['a']['signup']['count'],d['b']['signup']['count'])")"
(cd "$PROJ" && npx -y wrangler d1 execute global-neighbors-db --local --json --command "SELECT SUM(created_at % 86400000) AS n FROM landing_events WHERE event LIKE 'signup:%'" 2>/dev/null) > $T/body
check "sign-up keeps the day only" 0 "$(j "d[0]['results'][0]['n']")"

echo "== verdict"
seed 50 1 50 20;    check "big early gap: still collecting" collecting "$(res "d['test']['status']")"
seed 199 10 200 60; check "one short of target: still collecting" collecting "$(res "d['test']['status']")"
seed 200 20 200 40; check "B wins at target" B "$(res "d['test']['status']")"
check "p-value matches reference (0.0051)" 0.0051 "$(j "round(d['test']['pValue'],4)")"
check "Wilson interval matches reference" "[0.0657, 0.1494]" "$(j "[round(x,4) for x in d['a']['cta']['ci']]")"
seed 200 40 200 20; check "A wins at target" A "$(res "d['test']['status']")"
seed 200 20 200 24; check "small gap: no clear difference" none "$(res "d['test']['status']")"
seed 200 0 200 0;   check "no clicks: no clear difference" none "$(res "d['test']['status']")"
seed 200 20 400 80; check "uneven split flagged" broken "$(res "d['test']['status']")"
wipe;               check "empty: collecting" collecting "$(res "d['test']['status']")"
check "empty: no bad numbers" "(0, [0, 0])" "$(j "(d['a']['cta']['rate'],d['a']['cta']['ci'])")"
finish
