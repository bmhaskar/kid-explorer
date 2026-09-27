#!/usr/bin/env bash
# Loads the real extension under a stub pi API and drives its behaviour.
#
# The harness is a .mjs that imports the .ts directly. Whether node can do that
# at all, or needs --experimental-strip-types, depends on the release: 22.6 added
# the transform behind that flag and later releases switched it on by default.
# So the capability is probed, never inferred from the version number.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"
# shellcheck disable=SC1091
source "$here/lib/assert.sh"

printf 'extension-loads\n'

ext="$root/extensions/kid-explorer-autostart.ts"
assert_file "$ext"

if ! command -v node >/dev/null 2>&1; then
	kid_skip "node harness" "node is not installed"
else
	node_ver="$(node -p 'process.versions.node' 2>/dev/null || echo 'unknown')"

	# --- the static contract, checkable with no node at all -----------------
	if grep -qE "^[[:space:]]*import[[:space:]]+type[[:space:]]" "$ext"; then
		kid_pass "the pi type import is type-only, so it is erased at load"
	else
		kid_fail "the pi import is not marked type-only — it would need pi present at runtime"
	fi

	if grep -qE "^import[[:space:]]+[^t]" "$ext"; then
		kid_fail "extension has a value import that is not type-only"
	else
		kid_pass "extension has no value imports to resolve"
	fi

	if grep -qE "from ['\"]\.\.?/" "$ext"; then
		kid_fail "extension imports a relative path — it must be copy-pasteable on its own"
	else
		kid_pass "extension has no relative imports"
	fi

	bad_deps="$(grep -oE "from ['\"][^'\"]+['\"]" "$ext" | grep -oE "['\"][^'\"]+['\"]$" | tr -d "'\"" | grep -vE '^node:' | grep -v '^@earendil-works/pi-coding-agent$' || true)"
	if [[ -n "$bad_deps" ]]; then
		kid_fail "extension depends on an unvendored package" "$bad_deps"
	else
		kid_pass "extension depends only on node builtins and pi's own types"
	fi

	assert_has "$ext" 'PI_KID_EXPLORER'
	assert_has "$ext" 'if (!enabled()) return'

	# --- the behavioural harness ---------------------------------------------
	if ts_flag="$(kid_ts_flag)"; then
		if [[ -n "$ts_flag" ]]; then
			kid_pass "node $node_ver imports TypeScript with $ts_flag — using it"
		else
			kid_pass "node $node_ver imports TypeScript directly"
		fi

		if out="$(node ${ts_flag:+"$ts_flag"} "$here/harness/extension.harness.mjs" "$ext" 2>&1)"; then
			rc=0
		else
			rc=$?
		fi
		printf '%s\n' "$out" | grep -v 'extension harness' | sed 's/^/    /'

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
	else
		# Not a failure: this node build simply cannot load TypeScript, so the
		# behavioural half cannot run here. Say so plainly rather than pass silently.
		kid_skip "behavioural harness" "node $node_ver cannot import .ts"
		printf '    %s\n' "it can neither import .ts as-is nor with --experimental-strip-types."
		printf '    %s\n' "Need node >= 22.6, the release that added the transform."
		printf '    %s\n' "The static contract above was still checked and stands on its own."
	fi
fi

finish extension-loads
