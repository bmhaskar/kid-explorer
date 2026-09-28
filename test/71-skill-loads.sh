#!/usr/bin/env bash
# Does the skill actually reach the model, rather than merely fail to complain?
#
# This file exists because the live suite was green on a skill that did not load.
# Its strategy was to start pi with a bad key and require that the run reached the
# provider boundary, on the reasoning that anything of ours which threw on the way
# in would show up as a stack trace. That reasoning is sound for a crash and
# useless for a refusal: a skill whose frontmatter no parser will accept does not
# crash, it is dropped, and pi drops it in silence. The screenshot that started
# all this showed the skill listed, selected, and never read, with nothing in the
# output to say so.
#
# The check that does work is written into pi's own documentation, skills.md line
# 43: "At startup, Pi scans configured skill locations and adds each skill's
# name, description, and path to the system prompt." So a skill that loaded is
# visible in the prompt, and one that did not is simply not there. Presence is
# asserted, not silence.
#
# The negative control below is what makes the assertion worth anything. A probe
# that cannot fail the broken case is not a check, and the previous suite is the
# evidence for how expensive that can be.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"
# shellcheck disable=SC1091
source "$here/lib/assert.sh"

printf 'skill load\n'

pi_bin="${PI_BIN:-}"
if [[ -z "$pi_bin" ]]; then
	if command -v pi >/dev/null 2>&1; then pi_bin="$(command -v pi)"
	else
		for c in "$HOME"/.local/share/mise/installs/pi/*/pi/pi; do
			[[ -x "$c" ]] && { pi_bin="$c"; break; }
		done
	fi
fi
if [[ -z "$pi_bin" || ! -x "$pi_bin" ]]; then
	kid_skip "skill load" "no pi binary found (set PI_BIN=/path/to/pi)"
	finish skill-load; exit 0
fi

# a marker drawn from the real description, so the assertion is about this skill
# and not about any text that happens to be in a prompt
readonly MARKER="Curious-kid companion"
readonly SKILL_NAME="kid-explorer"

scratch="$(mktemp -d -t kidload.XXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT

# ask pi, in the only mode that shows what the model was given, for the prompt it
# would have sent. The key is deliberately bad: the prompt is assembled before any
# request leaves, so a refusal at the provider boundary is after the thing measured
ask_pi() { # $1 = HOME
	HOME="$1" PI_OFFLINE=1 PI_TELEMETRY=0 timeout 120 "$pi_bin" \
		--provider google --model google/kid-explorer-probe --api-key invalid-for-probe \
		--no-themes --no-context-files --offline --verbose --mode json \
		--print "hi" 2>&1 || true
}

install_into() { # $1 = HOME
	mkdir -p "$1/.pi/agent/skills"
	cp -r -- "$root" "$1/.pi/agent/skills/$SKILL_NAME"
}

# --- the positive case: the skill must be in the prompt the model is given ----
good_h="$scratch/good"; mkdir -p "$good_h"
install_into "$good_h"
good_out="$(ask_pi "$good_h")"

# the block must be ours, not merely some block. Asserted on its own this was
# the one line in this file that failed on both the good run and the broken one,
# which is the signature of an assertion that cannot be true and so proves nothing;
# it is kept, but scoped to the skill under test so that it can distinguish them
if printf '%s\n' "$good_out" | grep -qF "<name>$SKILL_NAME</name>"; then
	kid_pass "pi advertised a skill block, and it is ours"
else
	kid_fail "pi advertised no block naming $SKILL_NAME at all, so nothing below can be trusted"
fi

if printf '%s\n' "$good_out" | grep -qF "$MARKER"; then
	kid_pass "the skill reached the prompt (its description is present)"
else
	kid_fail "the skill never reached the prompt"
	printf '    the description begins %s and pi was told nothing of it\n' "$MARKER" >&2
	printf '    check the frontmatter parses: node %s\n' "$here/harness/frontmatter.parser.check.mjs" >&2
fi

# the name is advertised apart from the description, and both are required: a
# block naming some other skill would satisfy the test above on its own
if printf '%s\n' "$good_out" | grep -qF "<name>$SKILL_NAME</name>"; then
	kid_pass "the skill is named in what it advertises"
else
	kid_fail "the skill was not named, only perhaps described by somebody else"
fi

# --- the negative control: a skill pi will not load must be absent -------------
#
# Without this the assertion above is a search for any text like ours, and it
# would have been satisfied by the working directory, which is where the four
# hits on "kid-explorer" in the first version of this probe all were.
broken_h="$scratch/broken"; mkdir -p "$broken_h"
install_into "$broken_h"
# the fault that shipped: an unquoted scalar carrying a colon and a space, which
# yaml reads as a mapping nested in a mapping, and which pi refuses in silence.
# Built by a node script rather than by a python heredoc, because the container
# that runs this has node and does not have python, and a check that leans on a
# tool the suite does not require passes at home and fails in CI
node "$here/harness/make-broken-frontmatter.mjs" \
	"$root/SKILL.md" "$broken_h/.pi/agent/skills/$SKILL_NAME/SKILL.md" \
	|| { kid_fail "the negative control could not be built"; }
if [[ ! -s "$broken_h/.pi/agent/skills/$SKILL_NAME/SKILL.md" ]]; then
	kid_fail "the negative control is empty, so the comparison below compares nothing"
fi

broken_out="$(ask_pi "$broken_h")"
if printf '%s\n' "$broken_out" | grep -qF "$MARKER"; then
	kid_fail "the negative control loaded, so the check above proves nothing"
	printf '    pi took a frontmatter that no parser accepts, which means the\n' >&2
	printf '    probe is reading something other than what it claims to read\n' >&2
else
	kid_pass "a skill pi will not load is absent from the prompt, so the check above can fail"
fi

# and the two runs must differ, or the probe is not observing the thing it names
if [[ "$good_out" == "$broken_out" ]]; then
	kid_fail "the good run and the broken run produced the same prompt, so nothing was measured"
else
	kid_pass "the two runs differ, which is what makes the assertion an assertion"
fi

# --- the tool the suite lacked, and which is now the first thing it does -------
# the parser check runs as part of this file too, so that a failure names the
# line and the column rather than leaving it to be inferred from an absence
if node "$here/harness/frontmatter.parser.check.mjs" >/dev/null 2>&1; then
	kid_pass "the frontmatter parses, which is why the block above is present"
else
	kid_fail "the frontmatter would be refused by a loader"
fi

finish skill-load
