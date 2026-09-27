# shellcheck disable=SC1090,SC2034,SC2154
# Shared assertion helpers for the kid-explorer test suite.
#
# Each test file is standalone:
#
#     #!/usr/bin/env bash
#     set -euo pipefail
#     here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
#     # shellcheck disable=SC1091
#     source "$here/lib/assert.sh"
#     ...
#     assert_file "$root/SKILL.md"
#     finish "structure"

: "${KID_ASSERT_PASS:=0}"
: "${KID_ASSERT_FAIL:=0}"
: "${KID_ASSERT_LINE:=0}"

if [[ -t 1 && "${NO_COLOR:-0}" != 1 ]]; then
	_KID_C_OK=$'\e[32m'
	_KID_C_BAD=$'\e[31m'
	_KID_C_WARN=$'\e[33m'
	_KID_C_DIM=$'\e[2m'
	_KID_C_OFF=$'\e[0m'
else
	_KID_C_OK='' _KID_C_BAD='' _KID_C_WARN='' _KID_C_DIM='' _KID_C_OFF=''
fi

kid_pass() {
	KID_ASSERT_PASS=$((KID_ASSERT_PASS + 1))
	printf '  %s✓%s %s\n' "$_KID_C_OK" "$_KID_C_OFF" "$1"
}

kid_fail() {
	KID_ASSERT_FAIL=$((KID_ASSERT_FAIL + 1))
	printf '  %s✗%s %s\n' "$_KID_C_BAD" "$_KID_C_OFF" "$1"
	[[ -n "${2:-}" ]] && printf '    %s%s%s\n' "$_KID_C_DIM" "$2" "$_KID_C_OFF"
	return 0
}

kid_note() { printf '  %s·%s %s\n' "$_KID_C_WARN" "$_KID_C_OFF" "$1"; }

kid_skip() {
	printf '  %s~%s %s (skipped: %s)\n' "$_KID_C_WARN" "$_KID_C_OFF" "$1" "${2:-not applicable}"
	KID_ASSERT_SKIPPED=$((${KID_ASSERT_SKIPPED:-0} + 1))
}

# --- capability probe ------------------------------------------------------

# Can this node build import a .ts file? The answer arrived late and unevenly:
# 22.6 added the type-stripping transform behind --experimental-strip-types, and
# later releases turned it on by default. Reading the version number and guessing
# is wrong: 22.6 satisfies a >= 22 test yet cannot import .ts without the flag.
# So the runtime is asked directly. Prints the flag required, which may be empty.
kid_ts_flag() { # -> the node flag needed to import .ts, or empty; false if none works
	local dir flag out
	dir="$(mktemp -d -t kidts.XXXXXX)" || return 1
	printf 'export default function (n: number): number { return n + 1; }\n' > "$dir/probe.ts"
	printf 'const m = await import(new URL("./probe.ts", import.meta.url));\nprocess.stdout.write(String(m.default(1)));\n' > "$dir/probe.mjs"
	for flag in '' '--experimental-strip-types'; do
		if [[ -n "$flag" ]]; then
			out="$(node "$flag" "$dir/probe.mjs" 2>/dev/null)" || out=""
		else
			out="$(node "$dir/probe.mjs" 2>/dev/null)" || out=""
		fi
		if [[ "$out" == "2" ]]; then
			rm -rf -- "$dir"
			printf '%s\n' "$flag"
			return 0
		fi
	done
	rm -rf -- "$dir"
	return 1
}

# --- file / content -------------------------------------------------------

assert_file() {
	[[ -f "$1" ]] && kid_pass "file exists: ${1##*/}" || kid_fail "missing file: $1"
}

assert_exec() {
	[[ -x "$1" ]] && kid_pass "executable: ${1##*/}" || kid_fail "not executable: $1"
}

assert_dir() {
	[[ -d "$1" ]] && kid_pass "dir exists: ${1##*/}" || kid_fail "missing dir: $1"
}

assert_has() { # file, literal-string
	if grep -qF -- "$2" "$1" 2>/dev/null; then
		kid_pass "$(basename -- "$1") contains \"$2\""
	else
		kid_fail "$(basename -- "$1") should contain: $2"
	fi
}

assert_lacks() { # file, literal-string
	if grep -qF -- "$2" "$1" 2>/dev/null; then
		kid_fail "$(basename -- "$1") must not contain: $2"
	else
		kid_pass "$(basename -- "$1") free of \"$2\""
	fi
}

assert_matches() { # file, extended-regex
	if grep -qE -- "$2" "$1" 2>/dev/null; then
		kid_pass "$(basename -- "$1") matches /$2/"
	else
		kid_fail "$(basename -- "$1") does not match /$2/"
	fi
}

assert_no_match() { # file, extended-regex
	if grep -qE -- "$2" "$1" 2>/dev/null; then
		kid_fail "$(basename -- "$1") must not match /$2/"
		grep -nE -- "$2" "$1" | head -3 | sed 's/^/    /'
	else
		kid_pass "$(basename -- "$1") free of /$2/"
	fi
}

assert_le_chars() { # label, actual, max
	if (( $2 <= $3 )); then
		kid_pass "$1 = $2 chars (limit $3)"
	else
		kid_fail "$1 = $2 chars, exceeds limit $3"
	fi
}

assert_eq() { # label, actual, expected
	if [[ "$2" == "$3" ]]; then
		kid_pass "$1"
	else
		kid_fail "$1" "got: [$2]  want: [$3]"
	fi
}

assert_ge() { # label, actual, min
	if (( $2 >= $3 )); then
		kid_pass "$1 = $2 (min $3)"
	else
		kid_fail "$1 = $2, below minimum $3"
	fi
}

# --- runner ---------------------------------------------------------------

finish() {
	local name="${1:-suite}"
	if (( KID_ASSERT_FAIL )); then
		printf '%s %s/%s passed — %s FAILED%s\n' \
			"$name" "$KID_ASSERT_PASS" "$((KID_ASSERT_PASS + KID_ASSERT_FAIL))" \
			"$_KID_C_BAD" "$_KID_C_OFF"
		return 1
	fi
	printf '%s %s/%s passed%s\n' \
		"$name" "$KID_ASSERT_PASS" "$((KID_ASSERT_PASS + KID_ASSERT_FAIL))" "$_KID_C_OFF"
	return 0
}
