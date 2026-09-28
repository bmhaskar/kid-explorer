#!/usr/bin/env bash
# The README is a claim about the program. Checked, not eyeballed.
#
# Documentation rots quietly and in a different way to code: nothing breaks, no
# test goes red, a parent simply types the flag that was renamed away and gets
# an error. So every assertion a person can make from this file is made here —
# the flags, the make targets, the files drawn in the layout tree, the suites
# named in the table, and the scripts invoked in the examples.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"
# shellcheck disable=SC1091
source "$here/lib/assert.sh"

printf 'documentation claims\n'

# the checker writes its findings here; scratch is not provided by the shared library
scratch="$(mktemp -d -t kiddocs.XXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT

cd "$root"
assert_file README.md
assert_file Makefile
assert_file "$here/harness/docs.claims.check.mjs"
assert_file "$here/harness/matrix.check.mjs"

node "$here/harness/matrix.check.mjs" >"$scratch/matrix.log" 2>&1
matrix_rc=$?
while IFS= read -r line; do
	case "$line" in
		"  ok  "*) kid_pass "matrix: ${line#  ok  }" ;;
		"  FAIL"*) kid_fail "matrix: ${line#  FAIL }" ;;
		*) kid_note "$line" ;;
	esac
done < "$scratch/matrix.log"
(( matrix_rc == 0 )) || kid_fail "the host matrix does not agree with the registry"

if node "$here/harness/docs.claims.check.mjs" >"$scratch/claims.log" 2>&1; then
	while IFS= read -r line; do
		case "$line" in
			"  ok  "*) kid_pass "${line#  ok  }" ;;
			*) kid_note "$line" ;;
		esac
	done < "$scratch/claims.log"
else
	while IFS= read -r line; do
		case "$line" in
			"  FAIL"*) kid_fail "${line#  FAIL }" ;;
			"  ok  "*) kid_pass "${line#  ok  }" ;;
			*) kid_note "$line" ;;
		esac
	done < "$scratch/claims.log"
fi

# --- the checkers, put to their own faults --------------------------------------
#
# Everything above asks whether the README agrees with the repository. These ask
# the prior question, which is whether the thing that asks has any way of saying
# no. A checker that cannot fail is worth less than no checker, because it is
# believed. Three of the checks in the file above were found to be missing or
# vacuous only by planting a fault and watching whether it was noticed, and one
# of them had been described in this file's own header for its whole life without
# ever having been written.
#
# They run here rather than only by hand for the reason the rest of the suite
# runs: a meta-test nobody runs rots silently, and its silence looks exactly like
# its success.

if node "$here/harness/docs.claims.faultcheck.mjs" >"$scratch/docs.claims.faultcheck.mjs.log" 2>&1; then
	kid_pass "the documentation checker catches every fault planted in it"
else
	kid_fail "the documentation checker let a planted fault through, or could not plant one"
	sed -n '1,20p' "$scratch/docs.claims.faultcheck.mjs.log" | sed 's/^/      /' >&2
fi
if node "$here/harness/docs.flags.faultcheck.mjs" >"$scratch/docs.flags.faultcheck.mjs.log" 2>&1; then
	kid_pass "the flag scoping catches every fault planted in it"
else
	kid_fail "the flag scoping let a planted fault through, or could not plant one"
	sed -n '1,20p' "$scratch/docs.flags.faultcheck.mjs.log" | sed 's/^/      /' >&2
fi

finish