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
# A machine that has never run pi has no ~/.pi at all. find then exits non-zero,
# and under set -o pipefail that failure travels out of the pipeline and into the
# assignment, where set -e kills the whole suite. Absence is a real state, so it
# has to be a value of its own rather than an error.
home_pi_digest() {
	local d="$HOME/.pi"
	if [[ ! -d "$d" ]]; then
		printf 'absent\n'
		return 0
	fi
	local out
	if out="$(find "$d" -type f 2>/dev/null | sort | md5sum | cut -d' ' -f1)"; then
		printf '%s\n' "${out:-empty}"
	else
		printf 'unreadable\n'
	fi
	return 0
}

before="$(home_pi_digest)"
PI_HOME="$scratch/home5" "$installer" >/dev/null 2>&1
after="$(home_pi_digest)"
assert_eq "installing left the real ~/.pi untouched" "$after" "$before"
if [[ "$before" == "absent" ]]; then
	kid_pass "the child machine had no ~/.pi before, and still has none"
fi

# --- 6. a corrupt local package must be refused without reaching the net ---

# A missing SKILL.md is no longer fatal: the installer fetches upstream instead.

# What must never happen is a half-populated local package being installed, or a

# fetch being attempted when the caller said --offline.

broken="$scratch/broken"; mkdir -p "$broken"

cp -- "$installer" "$broken/install.sh"

mkdir -p "$broken/references"

cp -- "$root/SKILL.md" "$broken/SKILL.md"          # SKILL.md present, references empty

rc=0

out="$(PI_HOME="$scratch/home6" "$broken/install.sh" --offline 2>&1)" || rc=$?

if (( rc != 0 )); then

	kid_pass "a package with empty references is refused (exit $rc)"

else

	kid_fail "a package with empty references was accepted"

fi

assert_has <(printf '%s\n' "$out") "is incomplete"

if [[ -e "$scratch/home6/skills/kid-explorer/SKILL.md" ]]; then

	kid_fail "it installed a half-populated package anyway"

else

	kid_pass "it installed nothing from a half-populated package"

fi



# and a checkout with no SKILL.md at all must not phone home when told not to

bare="$scratch/bare"; mkdir -p "$bare"

cp -- "$installer" "$bare/install.sh"

rc=0

out="$(PI_HOME="$scratch/home6b" "$bare/install.sh" --offline 2>&1)" || rc=$?

if (( rc != 0 )); then

	kid_pass "--offline stops a bare checkout from silently fetching (exit $rc)"

else

	kid_fail "--offline was ignored and the network was used"

fi

assert_has <(printf '%s\n' "$out") "refusing to fetch"



# --- 7. the extension must stay opt-in after install ------------------------
assert_has "$h1/extensions/kid-explorer-autostart.ts" 'PI_KID_EXPLORER'
if grep -qE '^\s*if \(!enabled\(\)\) return' "$h1/extensions/kid-explorer-autostart.ts"; then
	kid_pass "installed extension is inert until PI_KID_EXPLORER is set"
else
	kid_fail "installed extension is not gated — it would fire on the parent's machine"
fi

# --- 8. self-fetch mode: the piped one-liner path -----------------------------
# Run the installer from a directory that holds nothing, exactly as "curl | bash"
# does, so the documented install line is exercised and not merely asserted.
lonely="$scratch/lonely"; mkdir -p "$lonely"
cp -- "$installer" "$lonely/install.sh"

rc=0
out="$(PI_HOME="$scratch/home8" HOME="$scratch/home8" bash -s -- --offline < "$lonely/install.sh" 2>&1)" || rc=$?
assert_eq "with no checkout and --offline it refuses" "$rc" "3"
assert_has <(printf "%s\n" "$out") "refusing to fetch"
if [[ -e "$scratch/home8/skills/kid-explorer" ]]; then
	kid_fail "it installed something while refusing to fetch"
else
	kid_pass "nothing was installed when the fetch was refused"
fi

rc=0
out="$(PI_HOME="$scratch/home8b" bash -s -- --from https://github.com/bmhaskar/kid-explorer/archive/refs/heads/no-such-branch-xyz.tar.gz < "$lonely/install.sh" 2>&1)" || rc=$?
if (( rc != 0 )); then
	kid_pass "an unreachable --from source fails loudly (exit $rc)"
else
	kid_fail "an unreachable --from source was reported as success"
fi

# a tarball that is missing part of the package must be refused outright
partial="$scratch/partial"; mkdir -p "$partial/kid-explorer/references"
cp -- "$root/SKILL.md" "$partial/kid-explorer/SKILL.md"
cp -- "$root/references/content-policy.md" "$partial/kid-explorer/references/"
tar -C "$partial" -czf "$scratch/partial.tar.gz" kid-explorer
rc=0
out="$(PI_HOME="$scratch/home8c" bash -s -- --from "file://$scratch/partial.tar.gz" < "$lonely/install.sh" 2>&1)" || rc=$?
if (( rc != 0 )); then
	kid_pass "an incomplete package is refused (exit $rc)"
else
	kid_fail "an incomplete package was accepted"
fi
assert_has <(printf "%s\n" "$out") "is incomplete"
assert_has <(printf "%s\n" "$out") "refusing to install"
if [[ -e "$scratch/home8c/skills/kid-explorer/SKILL.md" ]]; then
	kid_fail "a partial package was written into the config anyway"
else
	kid_pass "a partial package left the config untouched"
fi

# --help must work even when the script has no file on disk to read
rc=0
out="$(bash -s -- --help < "$lonely/install.sh" 2>&1)" || rc=$?
assert_eq "--help works when piped" "$rc" "0"
assert_has <(printf "%s\n" "$out") "Kid Explorer installer"
assert_has <(printf "%s\n" "$out") "--offline"

# the exit code must survive the cleanup trap in every branch
rc=0
PI_HOME="$scratch/home8d" "$installer" --nonsense >/dev/null 2>&1 || rc=$?
assert_eq "an unknown option still exits 2 after the trap change" "$rc" "2"

finish fresh-install
