#!/usr/bin/env bash
# Portability: every host in the registry must receive the same policy.
#
# The point of this suite is that the adapters are generated, not copied. N
# hand-kept copies of a child-safety policy is N chances for one of them to
# drift, and drift in a safety policy is silent: the skill still installs, the
# host still starts, and the child simply gets a weaker set of rules than the
# one that was reviewed. So the assertions here are mostly about equality with
# the single source text, and about the validator actually refusing things.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"
# shellcheck disable=SC1091
source "$here/lib/assert.sh"

printf 'portability\n'

build="$root/adapters/build.mjs"
query="$here/harness/registry.query.mjs"
assert_file "$build"
assert_file "$query"

scratch="$(mktemp -d -t kidport.XXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT

# The registry also looks in $HOME/.config/kid-explorer/harnesses. Left alone
# that would make this suite depend on whatever the machine happens to have, so
# HOME is pinned to an empty directory and the only user entries in scope are
# the fixtures below.
export HOME="$scratch/home"
mkdir -p -- "$HOME"

# isolate: only the good fixture directory is in scope for the pickup tests
good="$scratch/good"
mkdir -p -- "$good"
cp -- "$here/fixtures/harnesses/"*.harness.json "$good/" 2>/dev/null || true

q() { node "$query" "$@"; }

# assert_has against captured output. A process substitution would label the
# assertion with its file descriptor, which makes a failure unreadable, so the
# output is written to a file and named after the thing that produced it.
cap() { # name, command...
	local name="$1"; shift
	"$@" > "$scratch/cap.$name" 2>&1 || true
	printf '%s\n' "$scratch/cap.$name"
}

# --- 1. the registry is readable, and names every host it claims -------------
keys=()
while IFS= read -r line; do [[ -n "$line" ]] && keys+=("$line"); done < <(q keys)
assert_ge "registry names at least eight hosts" "${#keys[@]}" 8
assert_eq "generic is always available as the fallback" \
	"$(printf '%s' "$(printf '%s\n' "${keys[@]}" | grep -c '^generic$' || true)")" "1"

# --- 2. every host builds, and lands where the registry says it should -------
out="$scratch/build"
assert_eq "all hosts build" "$(node "$build" --harness all --out "$out" >/dev/null 2>&1; echo $?)" "0"
assert_eq "all hosts pass their own checks" \
	"$(node "$build" --verify all --out "$out" >/dev/null 2>&1; echo $?)" "0"

for k in "${keys[@]}"; do
	kind="$(q field "$k" kind)"
	case "$kind" in
		skill|both)
			dir="$(q field "$k" projectDir)"
			assert_file "$out/$k/$dir/kid-explorer/SKILL.md"
			assert_dir "$out/$k/$dir/kid-explorer/references"
			;;
	esac
	case "$kind" in
		rules|both)
			rd="$(q field "$k" rulesDir)"
			re="$(q field "$k" rulesExt)"
			rn="$(q field "$k" rulesName)"
			[[ -n "$rn" ]] || rn=kid-explorer
			assert_file "$out/$k/$rd/$rn.$re"
			;;
	esac
	cf="$(q field "$k" contextFile)"
	[[ -z "$cf" ]] || assert_file "$out/$k/$cf"
done

# --- 3. the body is one text, byte for byte, in every host -------------------
# This is the assertion the whole design rests on. Only the frontmatter may
# differ between hosts; everything a child would ever be told is the same
# bytes, because it is the same file.
body_digest="$(awk 'f{print} /^---$/{c++} c==2{f=1}' "$root/SKILL.md" | cksum | awk '{print $1}')"
same=0; differ=()
for k in "${keys[@]}"; do
	kind="$(q field "$k" kind)"
	[[ "$kind" == skill || "$kind" == both ]] || continue
	dir="$(q field "$k" projectDir)"
	d="$(awk 'f{print} /^---$/{c++} c==2{f=1}' "$out/$k/$dir/kid-explorer/SKILL.md" | cksum | awk '{print $1}')"
	if [[ "$d" == "$body_digest" ]]; then same=$((same + 1)); else differ+=("$k"); fi
done
assert_eq "every host carries the identical body" "${#differ[@]}" 0
assert_ge "at least six hosts were compared" "$same" 6

# the references are copied, never rewritten
ref_digest="$(cksum "$root"/references/*.md | awk '{print $1}' | sort | cksum | awk '{print $1}')"
k0="${keys[0]}"
dir0="$(q field "$k0" projectDir)"
built_ref="$(cksum "$out/$k0/$dir0/kid-explorer/references/"*.md | awk '{print $1}' | sort | cksum | awk '{print $1}')"
assert_eq "the references are byte-identical copies" "$built_ref" "$ref_digest"

# --- 4. the frontmatter stays inside the specification -----------------------
# claude.ai rejects an upload whose frontmatter carries a field it does not
# know, so an adapter that invented a field would break the one host that
# matters most for distribution.
allowed_fields='^(name|description|license|compatibility|metadata|allowed-tools|disallowed-tools):'
for k in "${keys[@]}"; do
	kind="$(q field "$k" kind)"
	[[ "$kind" == skill || "$kind" == both ]] || continue
	dir="$(q field "$k" projectDir)"
	f="$out/$k/$dir/kid-explorer/SKILL.md"
	bad="$(awk -v re="$allowed_fields" '
		/^---$/{c++; next}
		c==1 && /^[A-Za-z0-9_-]+:/ { if ($0 !~ re) print }
	' "$f")"
	assert_eq "$k: frontmatter uses only spec fields" "${#bad}" 0
done

# --- 5. no host is ever handed a shell, however it names its tools -----------
never=()
while IFS= read -r line; do [[ -n "$line" ]] && never+=("$line"); done < <(q never)
assert_ge "the never-grant list is populated" "${#never[@]}" 10
for k in "${keys[@]}"; do
	kind="$(q field "$k" kind)"
	[[ "$kind" == skill || "$kind" == both ]] || continue
	dir="$(q field "$k" projectDir)"
	granted="$(sed -n 's/^allowed-tools:[[:space:]]*//p' "$out/$k/$dir/kid-explorer/SKILL.md" | tr ',' '\n' | tr -d '[:space:]')"
	hit=""
	for t in "${never[@]}"; do
		if printf '%s\n' "$granted" | grep -qix -- "^$(printf '%s' "$t" | sed 's/[][^A-Za-z0-9_-]/\\&/g')$"; then hit="$t"; break; fi
	done
	assert_eq "$k: grants no forbidden tool" "${hit}" ""
done

# a host that declares a deny list must actually have it emitted
for k in "${keys[@]}"; do
	denied="$(q field "$k" deniedTools)"
	[[ -n "$denied" && "$denied" != "[]" ]] || continue
	kind="$(q field "$k" kind)"
	[[ "$kind" == skill || "$kind" == both ]] || continue
	dir="$(q field "$k" projectDir)"
	assert_matches "$out/$k/$dir/kid-explorer/SKILL.md" '^disallowed-tools: *[^[:space:]]'
done

# --- 6. the clauses survive, in the artefact that is supposed to carry them --
core=(); while IFS= read -r line; do [[ -n "$line" ]] && core+=("$line"); done < <(q clauses core)
assert_ge "the core clause list is populated" "${#core[@]}" 6
for k in "${keys[@]}"; do
	kind="$(q field "$k" kind)"
	[[ "$kind" == skill || "$kind" == both ]] || continue
	dir="$(q field "$k" projectDir)"
	f="$out/$k/$dir/kid-explorer/SKILL.md"
	for c in "${core[@]}"; do
		assert_has "$f" "$c"
	done
done

# a rules-only host has nothing to load later, so the whole policy has to be
# present in its context file; this is the gap the first run of this suite found
for k in "${keys[@]}"; do
	[[ "$(q field "$k" inlineBody)" == "true" ]] || continue
	cf="$(q field "$k" contextFile)"
	assert_file "$out/$k/$cf"
	for c in "A refusal of detail is not a refusal of him" "A boundary is not a punishment" "No private data"; do
		assert_has "$out/$k/$cf" "$c"
	done
done

# --- 7. regeneration is idempotent, and the blocks never nest ----------------
again="$scratch/again"
node "$build" --harness all --out "$again" >/dev/null 2>&1
drift=()
while IFS= read -r -d $'\0' f; do
	rel="${f#"$again"/}"
	cmp -s "$f" "$out/$rel" || drift+=("$rel")
done < <(find "$again" -type f -print0)
assert_eq "a second build produces the same bytes" "${#drift[@]}" 0

for k in "${keys[@]}"; do
	cf="$(q field "$k" contextFile)"
	[[ -z "$cf" ]] && continue
	f="$out/$k/$cf"
	b="$(grep -c 'begin kid-explorer' "$f" || true)"
	e="$(grep -c 'end kid-explorer' "$f" || true)"
	assert_eq "$k: the blocks are balanced" "$b" "$e"
done

# writing twice into a pre-existing file must not stack a second copy
twice="$scratch/twice"
mkdir -p -- "$twice/cursor"
printf '# my own notes\n\nkeep me\n' > "$twice/cursor/AGENTS.md"
node "$build" --harness cursor --out "$twice" >/dev/null 2>&1
node "$build" --harness cursor --out "$twice" >/dev/null 2>&1
assert_has "$twice/cursor/AGENTS.md" "keep me"
assert_eq "the rail is not duplicated by a second run" \
	"$(grep -c 'begin kid-explorer guard rail' "$twice/cursor/AGENTS.md" || true)" "1"

# --- 8. the registry is open: a family can add a host without a patch -------
export KID_EXPLORER_HARNESS_DIR="$good"
assert_eq "a user-defined host is accepted" \
	"$(node "$build" --harness windsurf --out "$scratch/user" >/dev/null 2>&1; echo $?)" "0"
assert_file "$scratch/user/windsurf/.windsurf/rules/kid-explorer.mdc"
assert_has "$scratch/user/windsurf/AGENTS.md" "A boundary is not a punishment"
assert_eq "and it passes the same checks as a built-in" \
	"$(node "$build" --verify windsurf --out "$scratch/user" >/dev/null 2>&1; echo $?)" "0"
unset KID_EXPLORER_HARNESS_DIR

# --- 9. an unknown host fails loudly, and says what to do about it -----------
uout_file="$scratch/unknown.txt"
node "$build" --harness notahost --out "$scratch/unknown" >"$uout_file" 2>&1 || true
assert_has "$uout_file" "no harness named"
assert_has "$uout_file" "adapters/harnesses/"
assert_has "$uout_file" "--kind"

# --- 10. the validator refuses the specs it exists to refuse -----------------
# A registry anyone can extend is only safe if the checks are real, so each
# fixture is loaded on its own and the build must refuse it, by name.
bad="$scratch/bad"
declare -A expect=(
	[grants-shell]='may never grant'
	[unknown-kind]='is unknown'
	[escaping-path]='must not contain ..'
	[missing-fields]='requires a non-empty'
	[nested-frontmatter]='must be a scalar'
	[broken-json]='not valid JSON'
)
for name in "${!expect[@]}"; do
	src="$here/fixtures/harnesses-invalid/$name.harness.json"
	assert_file "$src"
	mkdir -p -- "$bad/$name"
	cp -- "$src" "$bad/$name/$name.harness.json"
	msg_file="$scratch/reject.$name.txt"
	KID_EXPLORER_HARNESS_DIR="$bad/$name" node "$build" --harness "$name" \
		--out "$scratch/rejected" >"$msg_file" 2>&1 || true
	assert_has "$msg_file" "$name"
	assert_has "$msg_file" "${expect[$name]}"
done

# --- 11. meta-test: the checks can actually fail -----------------------------
# An assertion that cannot fail has not checked anything. Remove one clause from
# one generated file and the verifier must notice.
tampered="$scratch/tampered"
mkdir -p -- "$tampered"
cp -a -- "$out/claude" "$tampered/claude"
tf="$tampered/claude/$(q field claude projectDir)/kid-explorer/SKILL.md"
assert_file "$tf"
awk '!/There is no wrong answer/' "$tf" > "$tf.tmp" && mv -- "$tf.tmp" "$tf"
rc=0
node "$build" --verify claude --out "$tampered" >/dev/null 2>&1 || rc=$?
assert_eq "a removed safety clause is detected" "$rc" 1

# and a body that has been edited by hand is detected too
mkdir -p -- "$scratch/gemini-edit"
cp -a -- "$out/gemini" "$scratch/gemini-edit/gemini"
gf="$scratch/gemini-edit/gemini/$(q field gemini projectDir)/kid-explorer/SKILL.md"
printf '\nAn extra rule invented by hand.\n' >> "$gf"
rc=0
node "$build" --verify gemini --out "$scratch/gemini-edit" >/dev/null 2>&1 || rc=$?
assert_eq "a hand-edited body is detected" "$rc" 1

printf '  %s%d hosts covered%s\n' "$_KID_C_DIM" "${#keys[@]}" "$_KID_C_OFF"
finish
