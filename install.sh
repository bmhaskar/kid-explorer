#!/usr/bin/env bash
#
# Kid Explorer installer — copies the skill (and optionally the auto-menu
# extension) into the pi agent configuration.
#
#   ./install.sh                 install from this checkout
#   ./install.sh --skill         skill only, no extension
#   ./install.sh --no-ext        same as --skill
#   ./install.sh --from URL      install a specific archive tarball
#   ./install.sh --repo O/N      upstream to fetch from (default bmhaskar/kid-explorer)
#   ./install.sh --branch NAME   branch to fetch (default main)
#   ./install.sh --offline       refuse any network use, even to fetch
#
# It also works piped, which is how the README installs it on the child's
# machine:
#
#   curl -fsSL https://raw.githubusercontent.com/bmhaskar/kid-explorer/main/install.sh | bash
#
# When there is no SKILL.md beside it, it fetches the upstream archive and
# installs from that, so a single line is enough on a clean machine.
#
set -euo pipefail

# --- where am I? ------------------------------------------------------------
# A piped script has no path, so the local checkout may simply be absent.
script_dir=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
	script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
fi

pi_home="${PI_HOME:-$HOME/.pi/agent}"
repo="bmhaskar/kid-explorer"
branch="main"
from_url=""
with_ext=1
offline=0

cleanup_dirs=()
cleanup() {
	local d
	for d in "${cleanup_dirs[@]:-}"; do
		if [[ -n "$d" && -d "$d" ]]; then
			rm -rf -- "$d" || true
		fi
	done
	return 0
}
# Capture and restore the status: an EXIT trap whose last command fails would
# otherwise overwrite the real exit code and make a failed install look fine.
trap '_rc=$?; cleanup; exit "$_rc"' EXIT

usage() {
	# Must work when the script was piped and has no file on disk to read.
	if [[ -n "$script_dir" && -f "$script_dir/$(basename -- "${BASH_SOURCE[0]:-install.sh}")" ]]; then
		sed -n '2,24p' "${BASH_SOURCE[0]}" 2>/dev/null && return 0
	fi
	cat <<-USAGE
	Kid Explorer installer

	  ./install.sh                 install from this checkout
	  ./install.sh --skill         skill only, no extension
	  ./install.sh --no-ext        same as --skill
	  ./install.sh --from URL      install a specific archive tarball
	  ./install.sh --repo O/N      upstream (default bmhaskar/kid-explorer)
	  ./install.sh --branch NAME   branch to fetch (default main)
	  ./install.sh --offline       refuse any network use

	  Piped form, for a clean machine:
	  curl -fsSL https://raw.githubusercontent.com/bmhaskar/kid-explorer/main/install.sh | bash
	USAGE
}

while (($#)); do
	case "$1" in
		--skill|--no-ext|--without-extension) with_ext=0; shift ;;
		--from) from_url="${2:-}"; shift 2 ;;
		--from=*) from_url="${1#*=}"; shift ;;
		--repo) repo="${2:-}"; shift 2 ;;
		--repo=*) repo="${1#*=}"; shift ;;
		--branch) branch="${2:-}"; shift 2 ;;
		--branch=*) branch="${1#*=}"; shift ;;
		--offline) offline=1; shift ;;
		-h|--help) usage; exit 0 ;;
		--) shift; break ;;
		*) printf 'unknown option: %s\n' "$1" >&2; exit 2 ;;
	esac
done

# --- the package we are about to install must be complete -------------------
required=(SKILL.md
          references/content-policy.md
          references/reframing.md
          references/topic-bank.md
          references/situation-corner.md
          references/comms-style.md
          references/websearch-lens.md)

validate() { # dir
	local dir="$1" f
	[[ -f "$dir/SKILL.md" ]] || return 1
	for f in "${required[@]}"; do
		[[ -f "$dir/$f" ]] || return 1
	done
	if (( with_ext )); then
		[[ -f "$dir/extensions/kid-explorer-autostart.ts" ]] || return 1
	fi
	return 0
}

fetch_upstream() { # -> prints the extracted package directory
	if (( offline )); then
		printf 'refusing to fetch: --offline was given and there is no checkout here\n' >&2
		return 3
	fi
	local url="$from_url"
	if [[ -z "$url" ]]; then
		url="https://github.com/${repo}/archive/refs/heads/${branch}.tar.gz"
	fi
	local tool=""
	if command -v curl >/dev/null 2>&1; then tool="curl"
	elif command -v wget >/dev/null 2>&1; then tool="wget"
	else
		printf 'neither curl nor wget is available to fetch %s\n' "$url" >&2
		return 4
	fi
	local tmp
	tmp="$(mktemp -d -t kidfetch.XXXXXX)"
	cleanup_dirs+=("$tmp")
	printf 'no checkout here — fetching %s\n' "$url" >&2
	case "$tool" in
		curl) curl -fsSL --max-time 120 -o "$tmp/package.tar.gz" "$url" || return 5 ;;
		wget) wget -q -O "$tmp/package.tar.gz" "$url" || return 5 ;;
	esac
	tar -xzf "$tmp/package.tar.gz" -C "$tmp" || return 6
	# Archives carry a single top-level directory; a hand-made tarball may not.
	local inner
	inner="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -1)"
	if [[ -n "$inner" && -f "$inner/SKILL.md" ]]; then
		printf '%s\n' "$inner"
	else
		printf '%s\n' "$tmp"
	fi
}

# --- pick the source: a local checkout, or upstream --------------------------
src=""
if [[ -n "$script_dir" && -f "$script_dir/SKILL.md" ]]; then
	src="$script_dir"
elif [[ -n "$from_url" ]]; then
	src="$(fetch_upstream)" || exit $?
else
	rc=1
	if src="$(fetch_upstream)"; then
		:
	else
		rc=$?
		if [[ -n "$script_dir" ]]; then
			printf 'SKILL.md not found next to %s, and fetching failed\n' "$script_dir" >&2
		fi
		exit "$rc"
	fi
fi

if ! validate "$src"; then
	printf 'the package at %s is incomplete — refusing to install\n' "$src" >&2
	printf 'a complete package needs:\n' >&2
	printf '  %s\n' "${required[@]}" >&2
	(( with_ext )) && printf '  %s\n' 'extensions/kid-explorer-autostart.ts' >&2
	exit 1
fi

# --- install -----------------------------------------------------------------
skill_dest="$pi_home/skills/kid-explorer"

printf 'source        : %s\n' "$src"
printf 'pi config dir : %s\n' "$pi_home"
printf 'installing    : %s\n' "$skill_dest"

if [[ -e "$skill_dest" ]]; then
	backup="${skill_dest}.old.$(date +%Y%m%d%H%M%S)"
	printf 'existing skill moved to %s\n' "$backup"
	mv -- "$skill_dest" "$backup"
fi

mkdir -p -- "$skill_dest"
cp -R -- "$src/SKILL.md" "$src/references" "$skill_dest/"

if (( with_ext )); then
	mkdir -p -- "$pi_home/extensions"
	if [[ -f "$pi_home/extensions/kid-explorer-autostart.ts" ]]; then
		cp -- "$pi_home/extensions/kid-explorer-autostart.ts" \
			"$pi_home/extensions/kid-explorer-autostart.ts.old.$(date +%Y%m%d%H%M%S)"
	fi
	cp -- "$src/extensions/kid-explorer-autostart.ts" \
		"$pi_home/extensions/kid-explorer-autostart.ts"
	printf 'extension     : %s/kid-explorer-autostart.ts\n' "$pi_home/extensions"
fi

# --- post-check: the thing we just wrote must be readable and complete ------
missing=0
for f in "${required[@]}"; do
	[[ -f "$skill_dest/$f" ]] || { printf 'post-check failed: %s did not land\n' "$f" >&2; missing=1; }
done
if ! cmp -s "$src/SKILL.md" "$skill_dest/SKILL.md"; then
	printf 'post-check failed: the installed SKILL.md differs from the source\n' >&2
	missing=1
fi
if (( missing )); then
	exit 1
fi

cat <<-EOF

	  ✓ installed

	  Next, in the CHILD's shell only (never on the parent's machine):

	      echo 'export PI_KID_EXPLORER=1' >> ~/.bashrc
	      source ~/.bashrc

	  That turns on the auto-dealt Quest Cards menu and /quest and /wild.
	  Without it, start a game by typing:  /skill:kid-explorer

	  Then start pi and say:  let's play

EOF
