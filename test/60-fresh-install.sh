#!/usr/bin/env bash
# Fresh-install behaviour, exercised in throwaway PI_HOME directories.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"
# shellcheck disable=SC1091
source "$here/lib/assert.sh"

printf 'fresh-install\n'

scratch="$(mktemp -d -t kidinstall.XXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT

# A pristine copy of the repo, as the child would get it from git.
download="$scratch/checkout"
mkdir -p -- "$download"
tar -C "$root" --exclude=.git --exclude=node_modules -cf - . | tar -xC "$download"
assert_file "$download/install.sh"
assert_exec "$download/install.sh"

installer="$download/install.sh"

# --- 1. full install into an empty PI_HOME ----------------------------------
h1="$scratch/home1"
out="$(PI_HOME="$h1" "$installer" 2>&1)"
assert_eq "full install exits 0" "$?" "0"
assert_has <(printf '%s\n' "$out") "✓ installed"
assert_file "$h1/skills/kid-explorer/SKILL.md"
assert_dir  "$h1/skills/kid-explorer/references"
assert_file "$h1/extensions/kid-explorer-autostart.ts"

n_src=$(find "$root/references" -type f -name '*.md' | wc -l)
n_dst=$(find "$h1/skills/kid-explorer/references" -type f -name '*.md' | wc -l)
assert_eq "every reference file was copied" "$n_dst" "$n_src"

# byte-for-byte fidelity — the lens must not be altered in transit
if cmp -s "$root/SKILL.md" "$h1/skills/kid-explorer/SKILL.md"; then
	kid_pass "installed SKILL.md is byte-identical to the source"
else
	kid_fail "installed SKILL.md differs from the source"
fi
if cmp -s "$root/references/content-policy.md" "$h1/skills/kid-explorer/references/content-policy.md"; then
	kid_pass "content policy survived the copy intact"
else
	kid_fail "content policy was altered in transit"
fi

# --- 2. skill-only mode -----------------------------------------------------
h2="$scratch/home2"
PI_HOME="$h2" "$installer" --skill >/dev/null
assert_dir  "$h2/skills/kid-explorer"
if [[ -e "$h2/extensions/kid-explorer-autostart.ts" ]]; then
	kid_fail "--skill still installed the extension"
else
	kid_pass "--skill installs the skill without the extension"
fi
assert_lacks <(find "$h2" -type f | sed 's|.*/||') 'kid-explorer-autostart.ts'

h2b="$scratch/home2b"
PI_HOME="$h2b" "$installer" --no-ext >/dev/null
[[ -e "$h2b/extensions/kid-explorer-autostart.ts" ]] \
	&& kid_fail "--no-ext still installed the extension" \
	|| kid_pass "--no-ext is accepted as an alias of --skill"

# --- 3. argument handling ---------------------------------------------------
rc=0
PI_HOME="$scratch/home3" "$installer" --frobnicate >/dev/null 2>&1 || rc=$?
assert_eq "an unknown option is rejected with exit 2" "$rc" "2"

rc=0
PI_HOME="$scratch/home3" "$installer" --help >/dev/null 2>&1 || rc=$?
assert_eq "--help exits 0" "$rc" "0"

# --- 4. idempotency ---------------------------------------------------------
PI_HOME="$h1" "$installer" >/dev/null 2>&1
live="$(find "$h1/skills" -maxdepth 1 -mindepth 1 -type d -name 'kid-explorer' | wc -l)"
assert_eq "re-running leaves exactly one live skill dir" "$live" "1"
backups="$(find "$h1/skills" -maxdepth 1 -mindepth 1 -type d -name 'kid-explorer.old.*' | wc -l)"
assert_ge "the previous install was kept as a backup" "$backups" "1"
if cmp -s "$root/SKILL.md" "$h1/skills/kid-explorer/SKILL.md"; then
	kid_pass "re-install is still byte-perfect"
else
	kid_fail "re-install corrupted the skill"
fi

# --- 5. it must not reach outside PI_HOME -----------------------------------
before="$(find "$HOME/.pi" -type f 2>/dev/null | sort | md5sum | cut -d' ' -f1)"
PI_HOME="$scratch/home5" "$installer" >/dev/null 2>&1
after="$(find "$HOME/.pi" -type f 2>/dev/null | sort | md5sum | cut -d' ' -f1)"
assert_eq "installing left the real ~/.pi untouched" "$after" "$before"

# --- 6. it must fail loudly on a broken package ----------------------------
broken="$scratch/broken"
mkdir -p "$broken"
cp -- "$installer" "$broken/install.sh"          # no SKILL.md beside it
rc=0
out="$(PI_HOME="$scratch/home6" "$broken/install.sh" 2>&1)" || rc=$?
if (( rc != 0 )); then
	kid_pass "a package without SKILL.md is refused (exit $rc)"
else
	kid_fail "a package without SKILL.md was accepted"
fi
assert_has <(printf '%s\n' "$out") "SKILL.md not found"
if [[ -e "$scratch/home6/skills/kid-explorer/SKILL.md" ]]; then
	kid_fail "it installed a broken package anyway"
else
	kid_pass "it installed nothing from a broken package"
fi

# --- 7. the extension must stay opt-in after install ------------------------
assert_has "$h1/extensions/kid-explorer-autostart.ts" 'PI_KID_EXPLORER'
if grep -qE '^\s*if \(!enabled\(\)\) return' "$h1/extensions/kid-explorer-autostart.ts"; then
	kid_pass "installed extension is inert until PI_KID_EXPLORER is set"
else
	kid_fail "installed extension is not gated — it would fire on the parent's machine"
fi

finish fresh-install
