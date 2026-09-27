#!/usr/bin/env bash
# Loads the real extension under a stub pi API and drives its behaviour.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"
# shellcheck disable=SC1091
source "$here/lib/assert.sh"

printf 'extension-loads\n'

if ! command -v node >/dev/null 2>&1; then
	kid_skip "node harness" "node is not installed"
	finish extension-loads
	exit 0
fi

ext="$root/extensions/kid-explorer-autostart.ts"
assert_file "$ext"

# node must be new enough to strip TypeScript types natively (>= 22.6)
major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if (( major < 22 )); then
	kid_skip "native .ts loading" "node $major is too old (need >= 22.6)"
else
	kid_pass "node $(node -p 'process.versions.node') can load TypeScript directly"
fi

if out="$(node "$here/harness/extension.harness.mjs" "$ext" 2>&1)"; then
	rc=0
else
	rc=$?
fi
printf '%s\n' "$out" | grep -v 'extension harness' | sed 's/^  /    /'

# fold the harness counters into this file's tally
sumline="$(printf '%s\n' "$out" | sed -n 's/^#summary pass=\([0-9]*\) fail=\([0-9]*\)$/\1 \2/p' | tail -1)"
p="${sumline%% *}"; f="${sumline##* }"
# a missing summary means the harness died before reporting: count it as a failure
[[ "$p" =~ ^[0-9]+$ ]] || p=0
[[ "$f" =~ ^[0-9]+$ ]] || f=1
KID_ASSERT_PASS=$((KID_ASSERT_PASS + p))
KID_ASSERT_FAIL=$((KID_ASSERT_FAIL + f))

if (( rc == 0 && f == 0 )); then
	kid_pass "harness exited clean"
else
	kid_fail "harness reported a failure (exit $rc, $f failed assertions)"
fi

# the extension must be self-contained: no runtime imports beyond node builtins
if grep -qE "from ['\"]\.\.?/" "$ext"; then
	kid_fail "extension imports a relative path — it must be copy-pasteable on its own"
else
	kid_pass "extension has no relative imports"
fi
bad_deps="$(grep -oE "from ['\"][^'\"]+['\"]" "$ext" | grep -vE "node:|@earendil-works/pi-coding-agent" || true)"
if [[ -n "$bad_deps" ]]; then
	kid_fail "extension depends on an unvendored package" "$bad_deps"
else
	kid_pass "extension depends only on node builtins and pi's own types"
fi

# it must stay opt-in
assert_has "$ext" 'PI_KID_EXPLORER'
assert_has "$ext" 'if (!enabled()) return'

finish extension-loads
