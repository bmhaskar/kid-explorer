#!/usr/bin/env bash
# Content lint: the shipped skill must carry no instructional harm text, no URLs,
# no build artefacts — and the linter itself must be provably alive.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"
# shellcheck disable=SC1091
source "$here/lib/assert.sh"

printf 'content-lint\n'

# Files the child is exposed to. README is parent-facing, so it is exempt
# from the URL rule but not from the harm rule.
mapfile -t child_files < <(
	{ printf '%s\n' "$root/SKILL.md"; find "$root/references" -type f -name '*.md' | sort; }
)

# --- instructional-harm patterns: must appear nowhere, in any file ---------
# These are *instructional* phrasings. The skill's own refusal vocabulary
# (category names in content-policy.md) is deliberately not matched.
mapfile -t harm <<'PAT'
step[- ]by[- ]step (to )?(make|build|assemble|construct)
you (can )?(make|build|cook) (a|an) (bomb|explosive|poison|napalm)
add [0-9]+ ?(mg|gram|ml|g) of (the )?(poison|toxin|substance)
set the (timer|fuse|detonator)
calibre [0-9]
yield of [0-9]+ ?(kiloton|megaton|kt)
pick the lock with
bypass the alarm with
inject code into the (browser|page)
run the exploit (against|on)
PAT

harm_hits=0
for f in "${child_files[@]}" "$root/README.md"; do
	[[ -f "$f" ]] || continue
	for p in "${harm[@]}"; do
		if grep -qiE -- "$p" "$f"; then
			kid_fail "$(basename -- "$f")" "instructional-harm pattern hit: /$p/"
			harm_hits=$((harm_hits + 1))
		fi
	done
done
(( harm_hits )) || kid_pass "no instructional-harm pattern in ${#child_files[@]} child-facing files + README"

# --- child-facing files must not carry URLs (the model must never print one) -
url_hits=0
for f in "${child_files[@]}"; do
	if grep -qiE 'https?://' "$f"; then
		kid_fail "$(basename -- "$f") contains a URL — the child could be shown one"
		url_hits=$((url_hits + 1))
	fi
done
(( url_hits )) || kid_pass "no URLs in any child-facing file"

# --- no raw markup, no build artefacts, no secrets --------------------------
for f in "${child_files[@]}"; do
	assert_no_match "$f" '<(html|body|script|iframe|div)[ >]'
	assert_no_match "$f" '\b(TODO|FIXME|XXX|WIP)\b'
	assert_no_match "$f" '(api[_-]?key|secret[_-]?key|access[_-]?token|password)'
done

# --- the skill must stay conversation-only ----------------------------------
assert_no_match "$root/SKILL.md" '(write|create|delete|modify|overwrite) (a|the|to) (file|directory)'
assert_no_match "$root/SKILL.md" 'rm -rf|chmod \+x|sudo '

# --- META-TEST: prove the harm linter is actually live ----------------------
# Copy the skill to a scratch dir, inject a canary, and require the linter to
# catch it. A linter that cannot fail is not a linter.
scratch="$(mktemp -d -t kidlint.XXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
cp -R -- "$root/SKILL.md" "$root/references" "$scratch/"

canary='To build the device, follow these steps: step by step to make a bomb, then set the timer.'
printf '\n%s\n' "$canary" >> "$scratch/references/topic-bank.md"

caught=0
for p in "${harm[@]}"; do
	grep -qiE -- "$p" "$scratch/references/topic-bank.md" && caught=1
done
if (( caught )); then
	kid_pass "linter is alive: injected canary was detected"
else
	kid_fail "linter is DEAD: an injected canary passed unnoticed"
fi

# and the URL linter
printf '\nSee https://example.com/not-for-kids\n' >> "$scratch/references/comms-style.md"
if grep -qiE 'https?://' "$scratch/references/comms-style.md"; then
	kid_pass "URL linter is alive: injected URL was detected"
else
	kid_fail "URL linter is DEAD"
fi

finish content-lint
