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

# --- the space must be safe, not merely the content ---------------------
# Content safety stops him seeing something awful. Emotional safety is what lets
# him speak at all. A frightened child performs and complies and says nothing he
# means, so these clauses are load-bearing and not decoration.
E="$root/references/emotional-safety.md"
assert_file "$E"
assert_matches "$E" 'could he have said that here if he were afraid'

for guarantee in 'You cannot be in trouble here' 'There is no wrong answer' \
                 'Every feeling is allowed' 'Stop words always work' \
                 'You may tell me I am wrong' 'You may say "I do not know' \
                 'No time pressure' 'The door stays open'; do
	assert_has "$E" "$guarantee"
done

# the guarantees must be stated to him, not merely held by the agent
for guarantee in 'You cannot be in trouble here' 'There is no wrong answer' \
                 'Every feeling is allowed' 'Stop words always work'; do
	assert_has "$S" "$guarantee"
done

# a refusal of detail must never read as a refusal of him
assert_has "$E" 'A refusal of detail is not a refusal of him'
assert_has "$E" 'A boundary is not a punishment'
assert_has "$E" 'repair it visibly'
assert_has "$E" 'Never defend the error'

# the parent line must not be able to become a report on the child
for clause in 'never becomes a report on the child' 'could get him in trouble' \
              'Write no line' 'his feelings, his family, his body' \
              'Read it out' ; do
	assert_has "$E" "$clause"
done
assert_has "$S" 'never a report on the child'
assert_has "$S" 'write no line at all'

# confidentiality must be answered honestly, in both directions
assert_has "$E" 'Will you tell my mum'
assert_has "$E" 'I will not lie to you about it'
assert_has "$E" 'If you are not safe'
# and the data rule must not read as a rule about his words
assert_has "$S" 'No private data'
assert_has "$S" 'This is about *data*, not about *his words*'
assert_has "$S" 'we have no secrets here'

# the count must not be able to become a mark
assert_has "$S" 'The coin is not a mark'
assert_has "$S" 'withheld, never taken away, never reset'
assert_has "$S" 'no way to be at zero'
assert_has "$S" "say 'no coins'"
assert_has "$C" 'Keep the count, and never let it fall'
assert_has "$C" 'There is no wrong answer to correct'
assert_has "$C" 'Never compare'
assert_has "$C" 'His interests are not currency here'

# discipline framing must be gone from the boundary-holding
assert_has "$P" 'The three-time rule'
assert_has "$P" 'no strike, no warning, no tally, and no'
assert_has "$P" 'You have not done anything wrong'
assert_has "$P" 'the rule is about me, not about you'

# coaching must never be allowed to humiliate
assert_has "$Q" 'Never make him live the scene'
assert_has "$Q" 'Never demand a confession or an apology'
assert_has "$Q" 'He is not the defective part'
assert_has "$Q" 'never as a judgement on how he did'

# stop and repair must be first-class moves, not implications
assert_has "$S" '| **stop** |'
assert_has "$S" '| **repair** |'
assert_has "$S" 'ask no follow-up question'

# --- hazards must be NAMED and FORBIDDEN, not silently absent -----------------
# A hazard that is merely absent from the text can be reintroduced by anyone
# editing it. A hazard that is written down as forbidden cannot be reintroduced
# without tripping the assertions just above. So these strings must appear, in
# the prohibition tables, and must never appear as practice.
for hazard in 'Let a streak break, reset, or be lost' \
              'Award a coin only for a' \
              'Say "no, that is wrong", flat' \
              'Use his special interest as a reward or a withdrawal' \
              'Correct him in the middle of something he is telling you about' \
              'Never join a feeling to a correction with' \
              'Compare him to other children' \
              'Tell him a secret will be kept'; do
	assert_has "$E" "$hazard"
done

# ...and the same hazards must not survive anywhere as live practice
assert_lacks "$S" 'streak'
assert_lacks "$S" 'something good'
assert_lacks "$S" 'No secrets.'
assert_lacks "$P" 'Strike 1'
assert_lacks "$P" 'Strike 2'
assert_lacks "$P" 'Strike 3'
assert_lacks "$C" 'only for a real answer'
assert_lacks "$C" 'streak counter'
for f in "$S" "$P" "$C" "$Q" "$R" "$T" "$W" "$E"; do
	assert_no_match "$f" 'if you (are good|behave|finish your)'
	assert_no_match "$f" 'you should (know|apologise|say sorry)'
done

finish safety-canaries
