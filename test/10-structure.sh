#!/usr/bin/env bash
# Structural integrity of the skill package.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"
# shellcheck disable=SC1091
source "$here/lib/assert.sh"

printf 'structure\n'

# --- required files -------------------------------------------------------
assert_file "$root/SKILL.md"
assert_file "$root/README.md"
assert_file "$root/install.sh"
assert_exec "$root/install.sh"
assert_dir  "$root/references"
assert_dir  "$root/extensions"
assert_file "$root/extensions/kid-explorer-autostart.ts"

for f in content-policy reframing topic-bank situation-corner comms-style websearch-lens; do
	assert_file "$root/references/$f.md"
done

# --- every reference named in SKILL.md must exist -------------------------
mapfile -t refs < <(grep -oE 'references/[a-z0-9-]+\.md' "$root/SKILL.md" | sort -u)
if (( ${#refs[@]} )); then
	missing=0
	for r in "${refs[@]}"; do
		[[ -f "$root/$r" ]] || { kid_fail "SKILL.md points at a missing file: $r"; missing=1; }
	done
	(( missing )) || kid_pass "all ${#refs[@]} referenced paths resolve"
else
	kid_fail "SKILL.md references no files"
fi

# --- no orphan reference files (every file is reachable from SKILL.md) ----
orphans=0
while read -r f; do
	b="references/$(basename -- "$f")"
	grep -qF -- "$b" "$root/SKILL.md" || { kid_fail "orphan file, never referenced: $b"; orphans=1; }
done < <(find "$root/references" -type f -name '*.md' | sort)
(( orphans )) || kid_pass "no orphan files under references/"

# --- the four suits exist in the deck ------------------------------------
tb="$root/references/topic-bank.md"
for suit in 'History' 'Geography' 'Animals' 'Botany'; do
	assert_matches "$tb" "^## .*${suit}$"
done

cards=$(grep -cE '^\| \*\*[^*]+\*\*' "$tb" || true)
assert_ge "topic cards in the deck" "$cards" 40

wild=$(awk '/^## .*Wild cards/{w=1;next} /^## /{if(w)w=0} w&&/^- /{n++} END{print n+0}' "$tb")
assert_ge "wild-card entries" "$wild" 10

# --- the Time Bridge table is well formed --------------------------------
rb="$root/references/reframing.md"
assert_matches "$rb" '^\| He asks about \|'
rows=$(awk -F'|' '/^\|/ && NF == 5 { n++ } END { print n + 0 }' "$rb")
assert_ge "bridge rows (3 columns each)" "$rows" 20

# --- the situation bank is well formed ------------------------------------
sb="$root/references/situation-corner.md"
assert_matches "$sb" '^\| Situation \| The rule to land on \|'
srows=$(awk -F'|' '/^\|/ && NF == 4 { n++ } END { print n + 0 }' "$sb")
assert_ge "situation-bank rows" "$srows" 15

# --- markdown sanity: balanced fences, no tabs, no CRLF -------------------
while read -r f; do
	fences=$(grep -c '^```' "$f" || true)
	if (( fences % 2 == 0 )); then
		kid_pass "$(basename -- "$f"): code fences balanced ($fences)"
	else
		kid_fail "$(basename -- "$f"): unbalanced code fences ($fences)"
	fi
	if grep -qP '\t' "$f"; then
		kid_fail "$(basename -- "$f"): contains a tab character"
	else
		kid_pass "$(basename -- "$f"): no tabs"
	fi
	if grep -q $'\r' "$f"; then
		kid_fail "$(basename -- "$f"): CRLF line endings"
	else
		kid_pass "$(basename -- "$f"): unix line endings"
	fi
done < <(find "$root" -name '*.md' -not -path '*/.git/*' | sort)

finish structure
