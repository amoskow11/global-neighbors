#!/bin/bash
# Runs every API suite against a local dev server started with email OFF (no .dev.vars):
#   npx wrangler d1 migrations apply global-neighbors-db --local && npx wrangler pages dev
#   bash tests/run.sh
B="${1:-http://127.0.0.1:8788}"; DIR="$(cd "$(dirname "$0")" && pwd)"; cd "$DIR/.."
failed=0
for t in api_test trust_test media_test activity_test; do
  # Local requests all share one IP, so clear rate-limit records between suites.
  npx -y wrangler d1 execute global-neighbors-db --local --command "DELETE FROM login_attempts" >/dev/null 2>&1
  out=$(bash "$DIR/$t.sh" "$B" noemail)
  echo "### $t"; echo "$out" | grep -E "FAIL|PASS="
  echo "$out" | grep -q "FAIL=0" || failed=1
done
exit $failed
