#!/bin/bash
# Shared helpers for the API test scripts. Each script takes the base URL as $1.
# Every account a test creates uses an @example.com address, so test data is easy to find and remove.
T=$(mktemp -d); PASS=0; FAIL=0; S=$RANDOM
trap 'rm -rf "$T"' EXIT

check(){ if [ "$2" == "$3" ]; then PASS=$((PASS+1)); echo "  ok   $1"; else FAIL=$((FAIL+1)); echo "  FAIL $1 (expected $2, got $3)"; fi; }
# req <cookie-jar> <method> <path> [json] — prints the status code; the body lands in $T/body
req(){ local jar=$1 m=$2 p=$3 d=${4:-}
  if [ -n "$d" ]; then curl -s -o $T/body -w '%{http_code}' -b $T/$jar -c $T/$jar -X $m -H 'Content-Type: application/json' -H "Origin: $B" --data "$d" "$B/api/$p"
  else curl -s -o $T/body -w '%{http_code}' -b $T/$jar -c $T/$jar -X $m -H 'Content-Type: application/json' "$B/api/$p"; fi; }
# j <python expression over d> — evaluates against the last response body
j(){ python3 -c "import json,sys; d=json.load(open('$T/body')); print(eval(sys.argv[1]))" "$1"; }
# sql <statement> — runs against the local D1 database unless D1FLAG=--remote
sql(){ (cd "$PROJ" && npx -y wrangler d1 execute global-neighbors-db ${D1FLAG:---local} --command "$1" >/dev/null 2>&1); }
signup(){ req $1 POST auth/signup "{\"accountType\":\"$2\",\"displayName\":\"$3\",\"email\":\"$4\",\"password\":\"test password 123\",\"location\":\"Boston\",\"region\":\"Greater Boston\",\"acceptTerms\":true}"; }
finish(){ echo; echo "PASS=$PASS FAIL=$FAIL"; [ $FAIL -eq 0 ]; }
