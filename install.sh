#!/usr/bin/env bash
#
# Kid Explorer installer — copies the skill (and optionally the auto-menu
# extension) into the pi agent configuration.
#
#   ./install.sh              install skill + extension
#   ./install.sh --skill      skill only, no extension
#   ./install.sh --no-ext     same as --skill
#
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
pi_home="${PI_HOME:-$HOME/.pi/agent}"
skill_dest="$pi_home/skills/kid-explorer"
ext_dest="$pi_home/extensions"

with_ext=1
for a in "$@"; do
	case "$a" in
		--skill|--no-ext|--without-extension) with_ext=0 ;;
		-h|--help)
			sed -n '2,9p' "${BASH_SOURCE[0]}"
			exit 0
			;;
		*) printf 'unknown option: %s\n' "$a" >&2; exit 2 ;;
	esac
done

if [[ ! -f "$here/SKILL.md" ]]; then
	printf 'SKILL.md not found next to this script. Run it from the cloned repo.\n' >&2
	exit 1
fi

printf 'pi config dir : %s\n' "$pi_home"
printf 'installing    : %s\n' "$skill_dest"

if [[ -e "$skill_dest" ]]; then
	backup="${skill_dest}.old.$(date +%Y%m%d%H%M%S)"
	printf 'existing skill moved to %s\n' "$backup"
	mv -- "$skill_dest" "$backup"
fi

mkdir -p -- "$skill_dest"
cp -R -- "$here/SKILL.md" "$here/references" "$skill_dest/"

if (( with_ext )); then
	mkdir -p -- "$ext_dest"
	if [[ -f "$ext_dest/kid-explorer-autostart.ts" ]]; then
		cp -- "$ext_dest/kid-explorer-autostart.ts" \
			"$ext_dest/kid-explorer-autostart.ts.old.$(date +%Y%m%d%H%M%S)"
	fi
	cp -- "$here/extensions/kid-explorer-autostart.ts" \
		"$ext_dest/kid-explorer-autostart.ts"
	printf 'extension     : %s/kid-explorer-autostart.ts\n' "$ext_dest"
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
