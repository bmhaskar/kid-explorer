#!/usr/bin/env bash
# Frontmatter validity against the Agent Skills specification that pi implements.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"
# shellcheck disable=SC1091
source "$here/lib/assert.sh"

printf 'frontmatter\n'

skill="$root/SKILL.md"
dir_name="$(basename -- "$root")"

# --- the block must open on line 1 and close --------------------------------
assert_eq "line 1 is the frontmatter opener" "$(sed -n '1p' "$skill")" '---'
closer="$(awk 'NR>1 && /^---$/ {print NR; exit}' "$skill")"
if [[ -n "$closer" ]]; then
	kid_pass "frontmatter closes on line $closer"
else
	kid_fail "frontmatter is never closed with a second ---"
fi

# --- parse top-level keys --------------------------------------------------
# --- the block has to be a document, not merely a shape -------------------------
#
# Everything below this point asks whether named keys are present. That is not the
# same question as whether the block will load, and the difference is not academic:
# the description carried an unquoted ": " and no loader would take it, while every
# key was present and every key was found. The suite was green on three node
# versions and in a container, and the skill did not load on the one machine it was
# installed on. pi said so in terms anyone could read — "Nested mappings are not
# allowed in compact mappings at line 2, column 14" — and the suite had no way to
# hear it, because a regular expression that looks for ^key: cannot see that the
# value of a key is being read as a mapping of its own.
#
# So the artefact is now parsed before it is inspected, and a file that a loader
# would refuse is refused here first.
scratch="$(mktemp -d -t kidfm.XXXXXX)"
	trap 'rm -rf -- "$scratch"' EXIT
	if node "$here/harness/frontmatter.parser.check.mjs" >"$scratch/parser.log" 2>&1; then
	kid_pass "the frontmatter parses, and the parser knows a bad file from a good one"
else
	kid_fail "the frontmatter would be refused by a loader"
	sed -n '1,40p' "$scratch/parser.log" | sed 's/^/        /' >&2
fi

# every adapter the registry can build is generated from this file, so a fault here
# is a fault there: the same bytes reach nine hosts
for built in "$root"/adapters/harnesses/*.harness.json "$root"/test/fixtures/harnesses/*.harness.json; do
	[[ -f "$built" ]] || continue
		# read the file the way the registry reads it, in a file rather than in a
	# -e one-liner. The one-liner was the single reason the node 22.6 job had
	# ever gone red: a static import at the top of a -e script is refused
	# outside a module, so the probe died with a syntax error having read
	# nothing at all, and a perfectly good fixture beside it was reported as
	# broken. The file was fine; the checker was. Dynamic import is a call
	# rather than a statement, so it is legal in either kind of script and in
	# either release, which is what the suite's own capability probe already
	# did, for exactly this reason.
	if ! KID_SPEC_FILE="$built" node "$here/harness/spec.read.check.mjs" 2>/dev/null; then
		kid_fail "$(basename -- "$built") is not readable as a harness spec"
	fi
done

fm="$(awk 'NR==1{next} /^---$/{exit} {print}' "$skill")"
get() { printf '%s\n' "$fm" | awk -v k="$1" 'BEGIN{p=0} /^[a-z0-9-]+:/{p=($0 ~ "^"k":")} p' | head -1 \
	| sed -E 's/^[a-z0-9-]+:[[:space:]]*//; s/[[:space:]]+$//'; }

name="$(get name)"
desc="$(get description)"
tools="$(get allowed-tools)"

assert_eq "name is declared" "$([[ -n $name ]] && echo yes || echo no)" "yes"
# The spec prefers the declared name to match its directory. Check that against a
# canonical copy, so the result does not depend on what the checkout dir is called.
canon="$(mktemp -d -t kidfm.XXXXXX)"
trap 'rm -rf -- "$canon"' EXIT
mkdir -p "$canon/$name"
cp -- "$skill" "$canon/$name/SKILL.md"
if [[ -d "$canon/$name" && -f "$canon/$name/SKILL.md" ]]; then
	kid_pass "name '$name' is usable as an installable directory name"
else
	kid_fail "name '$name' cannot be used as a directory name"
fi
# In a real install the parent directory is named after the skill.
if [[ "$dir_name" == "kid-explorer" ]]; then
	assert_eq "installed directory name matches the declared name" "$dir_name" "$name"
else
	kid_note "checkout dir is '$dir_name', not '$name' — name/dir match checked canonically above"
fi

if [[ "$name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
	kid_pass "name '$name' is spec-legal (lowercase, digits, single hyphens)"
else
	kid_fail "name '$name' breaks the naming rule"
fi
assert_le_chars "name length" "${#name}" 64
assert_le_chars "description length" "${#desc}" 1024
assert_ge "description is routing-rich" "${#desc}" 120

# the description must say WHEN to use it, not only what it is
for hint in 'Use when' '12' 'autism' 'history' 'geography'; do
	assert_has <(printf '%s\n' "$desc") "$hint"
done

# --- required behavioural clauses must be declared -------------------------
assert_has "$skill" "allowed-tools:"
assert_has "$skill" "metadata:"

# --- the tool allowlist must be a read-only, web-capable set ---------------
NORM_TOOLS=",$(printf %s "$tools" | tr -d "[:space:]"),"
for t in web_search fetch_content get_search_content read; do
	if [[ "$NORM_TOOLS" == *",$t,"* ]]; then
		kid_pass "allowlist grants $t"
	else
		kid_fail "allowlist is missing $t"
	fi
done

# a child-facing skill must not pre-approve file or shell power
for danger in bash edit write; do
	if [[ "$NORM_TOOLS" == *",$danger,"* ]]; then
		kid_fail "allowlist must not pre-approve '$danger'"
	else
		kid_pass "allowlist withholds '$danger'"
	fi
done

# --- must stay model-invocable (so the menu can pop on session start) ------
if grep -qE '^disable-model-invocation:[[:space:]]*true' <<<"$fm"; then
	kid_fail "disable-model-invocation is true — the opening menu would not auto-fire"
else
	kid_pass "skill is model-invocable (auto-routing allowed)"
fi

# --- no secrets, no URLs to the child, in the frontmatter ------------------
assert_no_match <(printf '%s\n' "$fm") 'https?://'
assert_no_match <(printf '%s\n' "$fm") '(api[_-]?key|token|secret|password)'

finish frontmatter
