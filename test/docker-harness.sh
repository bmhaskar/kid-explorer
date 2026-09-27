#!/usr/bin/env bash
#
# Verify every supported harness inside a container, one host per container.
#
#   test/docker-harness.sh                    all known hosts, offline
#   test/docker-harness.sh --harness cursor   just these (comma separated)
#   test/docker-harness.sh --repeat 2         twice, to catch state leaking
#   test/docker-harness.sh --no-cache         rebuild the image without cache
#   test/docker-harness.sh --list             say which hosts would be covered
#
# Why a container, when 80-portability already covers the registry: the host
# suite checks what the generator emits into a scratch directory. This checks
# what the installer leaves on a machine, in the places a host really looks,
# with a home directory that has never seen this skill and no network to fetch
# anything with. Those are different claims, and only the second one is the
# thing the child depends on.
#
# Each run is a fresh container, so "pristine" is a property of the harness
# rather than something this script has to remember to clean up.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"

image="kid-explorer:test"
want=""
repeat=1
build_args=()
list_only=0

while (($#)); do
	case "$1" in
		--harness) want="${2:-}"; shift 2 ;;
		--harness=*) want="${1#*=}"; shift ;;
		--repeat) repeat="${2:-1}"; shift 2 ;;
		--repeat=*) repeat="${1#*=}"; shift ;;
		--image) image="${2:-$image}"; shift 2 ;;
		--image=*) image="${1#*=}"; shift ;;
		--no-cache) build_args+=(--no-cache); shift ;;
		--list) list_only=1; shift ;;
		-h|--help) sed -n '2,22p' "${BASH_SOURCE[0]}"; exit 0 ;;
		*) printf 'unknown option: %s\n' "$1" >&2; exit 2 ;;
	esac
done

build="$root/adapters/build.mjs"
checker="$here/harness/harness.check.mjs"
assert_present() { [[ -e "$1" ]] || { printf 'missing: %s\n' "$1" >&2; exit 1; }; }
assert_present "$build"; assert_present "$checker"

# The list comes from the registry, so a host added by a family is covered the
# moment it is added, with no edit to this file to forget.
mapfile -t all_hosts < <(node "$build" --list | awk '{print $1}')
(( ${#all_hosts[@]} )) || { printf 'the registry named no hosts\n' >&2; exit 1; }

if (( list_only )); then
	printf '%s\n' "${all_hosts[@]}"
	exit 0
fi

hosts=()
if [[ -z "$want" || "$want" == "all" ]]; then
	hosts=("${all_hosts[@]}")
else
	IFS=, read -r -a wanted <<< "$want"
	for w in "${wanted[@]}"; do
		w="${w// /}"
		[[ -n "$w" ]] || continue
		if printf '%s\n' "${all_hosts[@]}" | grep -qx -- "$w"; then hosts+=("$w"); else
			printf 'no harness named %s; known: %s\n' "$w" "${all_hosts[*]}" >&2
			exit 2
		fi
	done
fi

# --- runtime -----------------------------------------------------------------
runtimes="${DOCKER_CMD:-docker podman}"
rt=""
for c in $runtimes; do
	if command -v "$c" >/dev/null 2>&1; then rt="$c"; break; fi
done
if [[ -z "$rt" ]]; then
	printf 'no container runtime found (tried: %s)\n' "$runtimes" >&2
	printf 'this check is the one that proves the install lands where a host reads.\n' >&2
	printf 'install podman, or point DOCKER_CMD at your runtime.\n' >&2
	exit 127
fi
if ! "$rt" info >/dev/null 2>&1; then
	printf '%s is installed but the daemon is not reachable\n' "$rt" >&2
	exit 125
fi

# an extra harness directory is mounted in read-only, so that a host added by
# a family is verified by the same run that verifies the built-ins. Without
# this the open registry would be an untested claim on the child's machine
harness_dir="${KID_EXPLORER_HARNESS_DIR:-}"
mount_args=()
env_args=()
if [[ -n "$harness_dir" ]]; then
	if [[ ! -d "$harness_dir" ]]; then
		printf 'KID_EXPLORER_HARNESS_DIR names %s, which is not a directory\n' "$harness_dir" >&2
		exit 2
	fi
	harness_dir="$(cd -- "$harness_dir" && pwd -P)"
	mount_args+=(-v "$harness_dir:/harness-hosts:ro")
	env_args+=(-e KID_EXPLORER_HARNESS_DIR=/harness-hosts)
	printf 'extra hosts  : %s\n' "$harness_dir"
fi

if [[ ! "${KID_DOCKER_SKIP_BUILD:-}" == 1 ]]; then
	printf '\n▸ building %s\n' "$image"
	"$rt" build "${build_args[@]}" -f "$here/Dockerfile" --target base -t "$image" "$root" >/dev/null
fi

# --- one container per host ---------------------------------------------------
# The child script that runs inside. It installs the way a parent would, then
# asks whether the host would actually find the skill and the guard rails, then
# installs a second time over the top, because a parent re-runs an installer
# and that must not lose anything the first run put there.
inside() { # harness
	local h="$1"
	cat <<-EOF
	set -eu
	# a scratch home under /tmp, so the run is pristine, and the image runs as
	# its unprivileged node user, so this also proves the installer works for a
	# child account and not only for root
	export HOME=/tmp/kid-h
	export PI_HOME=/tmp/kid-h/.pi/agent
	export NO_COLOR=1
	rm -rf /tmp/kid-h /tmp/proj
	mkdir -p /tmp/kid-h /tmp/proj
	/app/install.sh --harness $h --skill --project /tmp/proj > /tmp/install1.log 2>&1
	node /app/test/harness/harness.check.mjs --harness $h --project /tmp/proj --home /tmp/kid-h
	/app/install.sh --harness $h --skill --project /tmp/proj > /tmp/install2.log 2>&1
	node /app/test/harness/harness.check.mjs --harness $h --project /tmp/proj --home /tmp/kid-h
	EOF
}

run_one() { # harness
	local h="$1"
	"$rt" run --rm \
		--network none \
		--cap-drop ALL \
		--security-opt no-new-privileges \
		-e NO_COLOR=1 \
		${mount_args[@]+"${mount_args[@]}"} \
		${env_args[@]+"${env_args[@]}"} \
		"$image" /bin/bash -c "$(inside "$h")"
}

printf '\n▸ %s · %d host(s), each in its own offline container\n' \
	"$("$rt" --version | head -1)" "${#hosts[@]}"

rc_all=0
for (( pass = 1; pass <= repeat; pass++ )); do
	(( repeat > 1 )) && printf '\n  ── pass %s/%s ──\n' "$pass" "$repeat"
	for h in "${hosts[@]}"; do
		t0=$(date +%s%N)
		if log="$(run_one "$h" 2>&1)"; then
			ms=$(( ( $(date +%s%N) - t0 ) / 1000000 ))
			n="$(printf '%s\n' "$log" | grep -o '[0-9]* checks passed' | tail -1)"
			printf '  ✓ %-9s %s%s  %s\n' "$h" "$n" "" "(${ms} ms)"
		else
			rc_all=1
			printf '  ✗ %s\n' "$h"
			printf '%s\n' "$log" | sed 's/^/      /'
		fi
	done
done

printf '\n'
if (( rc_all )); then
	printf '✗ harness installs FAILED\n'
else
	printf '✓ all %d hosts install and are found by their host, offline\n' "${#hosts[@]}"
fi
exit "$rc_all"
