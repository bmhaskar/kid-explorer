#!/usr/bin/env bash
# Safety canaries: the clauses that protect the child must be present and intact.
# If one of these disappears, the skill has silently lost a guard rail.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"
# shellcheck disable=SC1091
source "$here/lib/assert.sh"

printf 'safety-canaries\n'

S="$root/SKILL.md"
P="$root/references/content-policy.md"
R="$root/references/reframing.md"
T="$root/references/topic-bank.md"
C="$root/references/comms-style.md"
W="$root/references/websearch-lens.md"
Q="$root/references/situation-corner.md"

# --- the hard rules must all still be there ----------------------------------
for clause in 'Hard rules' 'No graphic detail' 'No instructions for harm' \
              'No glorification' 'No fear content' 'No adult content' \
              'Never paste raw web output' 'conversation skill only'; do
	assert_has "$S" "$clause"
done

# --- the escalation path must be intact, and must not promise secrecy -------
for clause in 'Distress / safety escalation' 'stop the game immediately' \
              'trusted grown-up' 'Never promise secrecy'; do
	assert_has "$S" "$clause"
done
assert_has "$P" 'Escalation script'
assert_has "$P" 'A grown-up you trust'
assert_has "$P" 'Do not resume the game in that turn'
assert_has "$P" 'The three-strike rule'

# a child-facing skill must never offer to keep a secret from the parent
for forbidden in "don't tell your parents" "keep it between us" "our secret" \
                 "do not tell your mum" "do not tell your dad"; do
	assert_lacks "$S" "$forbidden"
	assert_lacks "$P" "$forbidden"
done

# --- the deny list must still deny ------------------------------------------
for clause in 'Never share' 'Weapons' 'Hate ideology' 'Self-harm' '| Fear |'; do
	assert_has "$P" "$clause"
done

# --- the web lens must still inspect ----------------------------------------
assert_matches "$W" 'seven checks'
assert_matches "$W" 'Preferred sources'
assert_matches "$W" 'Never print a URL'
assert_matches "$W" 'Rewriting rules'
for n in 1 2 3 4 5 6 7; do
	assert_matches "$W" "^[[:space:]]*[|]?[[:space:]]*${n}[[:space:]]*[|]"
done

# --- the Time Bridge must still bridge --------------------------------------
assert_has "$R" 'Time Bridge'
assert_has "$R" 'Acknowledge'
assert_has "$R" 'Pivot'
assert_has "$R" 'Bridge'
assert_has "$R" 'never more than one sentence on the event itself'
assert_has "$R" 'World War 1'
assert_has "$R" 'penicillin'
assert_has "$R" 'Black Death'
assert_has "$R" 'quarantine'

# --- the turn contract must still be a contract -----------------------------
assert_matches "$S" '100.{0,4}150 words'
assert_matches "$S" 'One question only'
assert_matches "$S" 'Never a wall of text'
# the symbol contract is checked in node: bash cannot expand \\U escapes
# without a UTF-8 locale, which would make this assertion environment-dependent.
if command -v node >/dev/null 2>&1; then
	if lout="$(node "$here/harness/legend.check.mjs" "$S" 2>&1)"; then lrc=0; else lrc=$?; fi
	printf '%s\n' "$lout" | sed 's/^/  /'
	sumline="$(printf '%s\n' "$lout" | sed -n 's/^#summary pass=\([0-9]*\) fail=\([0-9]*\)$/\1 \2/p' | tail -1)"
	lp="${sumline%% *}"; lf="${sumline##* }"
	[[ "$lp" =~ ^[0-9]+$ ]] || lp=0
	[[ "$lf" =~ ^[0-9]+$ ]] || lf=1
	KID_ASSERT_PASS=$((KID_ASSERT_PASS + lp))
	KID_ASSERT_FAIL=$((KID_ASSERT_FAIL + lf))
	if (( lrc != 0 || lf != 0 )); then
		kid_fail "the symbol contract is broken"
	else
		kid_pass "symbol contract verified by the node harness"
	fi
	else
		kid_skip "symbol contract check" "node is not installed"
fi

# --- the autism + ADHD contract --------------------------------------------
for clause in 'Literal' 'idiom' 'Sarcasm' 'Name the feeling' 'Offer the exit' \
              'Hyperfocus is the style'; do
	assert_matches "$C" "$clause"
done
assert_matches "$Q" 'Never quiz his social skill'
assert_matches "$Q" 'Do not force an eye contact'
assert_matches "$Q" 'Give the words'
assert_matches "$Q" 'Always include the exit option'

# --- the game must still deal cards ------------------------------------------
assert_has "$S" 'QUEST CARDS'
assert_has "$S" 'pick 1, 2, 3, 4'
assert_has "$S" 'curiosity coin'
assert_has "$S" 'PARENT:'
assert_ge "cards offered on the menu" \
	"$(grep -cE '^[[:space:]]*[1-4][[:space:]]*[.·]' "$S" || true)" 4

# --- the deck must cover all four interests he actually has ----------------
for interest in 'History' 'Geography' 'Animals' 'Botany'; do
	assert_matches "$T" "$interest"
done

finish safety-canaries
