#!/usr/bin/env bash
#
# Dockerised test runner for the kid-explorer skill.
#
#   test/docker-test.sh                 build, then run the whole suite offline
#   test/docker-test.sh --per-suite     one fresh container per suite (isolation)
#   test/docker-test.sh --repeat 3      run the suite 3 times, in 3 fresh containers
#   test/docker-test.sh --live          also build the live stage and run the pi smoke test
#   test/docker-test.sh --shell         drop into a shell in the built image
#   test/docker-test.sh --no-cache      build without the layer cache
#   test/docker-test.sh --image NAME    tag to use (default: kid-explorer:test)
#
# Containers run with --network none, so a green run also proves the suite is
# hermetic: no network, no model, no credentials, no host state.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"

image="kid-explorer:test"
live_image="kid-explorer:live"
per_suite=0
repeat=1
live=0
shell=0
build_args=()

while (($#)); do
	case "$1" in
		--per-suite) per_suite=1; shift ;;
		--repeat) repeat="${2:-1}"; shift 2 ;;
		--repeat=*) repeat="${1#*=}"; shift ;;
		--live) live=1; shift ;;
		--shell) shell=1; shift ;;
		--no-cache) build_args+=(--no-cache); shift ;;
		--image) image="${2:-$image}"; live_image="${2}-live"; shift 2 ;;
		--image=*) image="${1#*=}"; live_image="$image-live"; shift ;;
		-h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0 ;;
		*) printf 'unknown option: %s\n' "$1" >&2; exit 2 ;;
	esac
done

if [[ ! "$repeat" =~ ^[1-9][0-9]*$ ]]; then
	printf '--repeat wants a positive integer, got: %s\n' "$repeat" >&2
	exit 2
fi

# --- pick a container runtime ------------------------------------------------
runtimes="${DOCKER_CMD:-docker podman}"
rt=""
for c in $runtimes; do
	if command -v "$c" >/dev/null 2>&1; then rt="$c"; break; fi
done
if [[ -z "$rt" ]]; then
	printf 'no container runtime found (tried: %s)\n' "$runtimes" >&2
	printf 'install podman, or point DOCKER_CMD at your runtime.\n' >&2
	exit 127
fi
if ! "$rt" info >/dev/null 2>&1; then
	printf '%s is installed but the daemon is not reachable.\n' "$rt" >&2
	printf 'start it, or use: DOCKER_CMD=podman %s\n' "$0" >&2
	exit 125
fi
printf 'runtime: %s\n' "$("$rt" --version | head -1)"

build() { # target tag
	local target="$1" tag="$2"
	printf '\n▸ building %s (target: %s)\n' "$tag" "$target"
	"$rt" build "${build_args[@]}" -f "$here/Dockerfile" --target "$target" -t "$tag" "$root"
}

run_offline() { # image cmd...
	local img="$1"; shift
	"$rt" run --rm --network none \
		--cap-drop ALL \
		--security-opt no-new-privileges \
		-e NO_COLOR=1 \
		"$img" "$@"
}

rc_all=0

# --- the main suite ----------------------------------------------------------
build base "$image"

if (( shell )); then
	printf '\n▸ interactive shell in %s\n' "$image"
	exec "$rt" run --rm -it --network none \
		--tmpfs /tmp:size=64m \
		-e NO_COLOR=0 \
		"$image" /bin/bash
fi

for (( i = 1; i <= repeat; i++ )); do
	if (( per_suite )); then
		printf '\n▸ run %s/%s · one container per suite\n' "$i" "$repeat"
		mapfile -t names < <(run_offline "$image" /app/test/run-all.sh --list)
		(( ${#names[@]} )) || { printf 'no suites listed\n' >&2; exit 1; }
		for n in "${names[@]}"; do
			printf '\n  ┌─ %s\n' "$n"
			if run_offline "$image" /app/test/run-all.sh --only "$n"; then
				printf '  └─ %s ok\n' "$n"
			else
				printf '  └─ %s FAILED\n' "$n"
				rc_all=1
			fi
		done
	else
		printf '\n▸ run %s/%s · full suite, offline\n' "$i" "$repeat"
		if run_offline "$image" /app/test/run-all.sh; then
			:
		else
			rc_all=1
		fi
	fi
done

# --- the live stage ---------------------------------------------------------
if (( live )); then
	build live "$live_image"
	printf '\n▸ live smoke test (pi loads the skill and the extension)\n'
	if run_offline "$live_image" /app/test/run-all.sh --only 70-pi-live; then
		printf '  └─ live load ok\n'
	else
		printf '  └─ live load FAILED\n'
		rc_all=1
	fi
fi

printf '\n'
if (( rc_all )); then
	printf '✗ docker tests FAILED\n'
else
	printf '✓ docker tests passed — hermetic (no network, no model, no host state)\n'
fi
exit "$rc_all"
