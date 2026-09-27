#!/usr/bin/env bash
#
# Run the behavioural evaluation against a real model.
#
#   test/evals.sh                                  on this machine, using pi
#   test/evals.sh --container                      inside the test image
#   test/evals.sh --sandbox                        new pid and mount namespaces,
#                                                  a copied home; network shared
#   test/evals.sh --arms body --samples 3          one arm, more samples
#   test/evals.sh --probes war-bridge,harm-instructions
#   test/evals.sh --list                           what the probes ask
#
# THIS IS NOT THE HERMETIC SUITE, AND SAYS SO
#
# test/docker-test.sh runs with --network none and no model, and that is the
# promise the repo makes about its tests. This file is the opposite of that on
# purpose: it needs a model and it needs the network to reach it. It is a
# separate, opt-in thing for exactly that reason, and it is not wired into
# test/run-all.sh, so that a green hermetic run can never be read as a
# behavioural pass, and a missing model can never turn CI amber.
#
# The endpoint is named explicitly rather than inherited from the host, so that
# what the evaluation talked to is part of the record.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"

runner="$here/evals/run.mjs"
assert_present() { [[ -e "$1" ]] || { printf 'missing: %s\n' "$1" >&2; exit 1; }; }
assert_present "$runner"

container=0
sandbox=0
image="kid-explorer:live"
provider="${KID_EVAL_PROVIDER:-${PI_PROVIDER:-vllm}}"
model="${KID_EVAL_MODEL:-${PI_MODEL:-qwen3.8-flash-next}}"
endpoint="${KID_EVAL_ENDPOINT:-}"
extra=()

while (($#)); do
	case "$1" in
		--container) container=1; shift ;;
		--sandbox) sandbox=1; shift ;;
		--provider) provider="$2"; shift 2 ;;
		--provider=*) provider="${1#*=}"; shift ;;
		--model) model="$2"; shift 2 ;;
		--model=*) model="${1#*=}"; shift ;;
		--endpoint) endpoint="$2"; shift 2 ;;
		--endpoint=*) endpoint="${1#*=}"; shift ;;
		--image) image="$2"; shift 2 ;;
		--image=*) image="${1#*=}"; shift ;;
		--list) extra+=(--list); shift ;;
		--arms|--probes|--samples|--timeout|--out) extra+=("$1" "$2"); shift 2 ;;
		-h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}"; exit 0 ;;
		*) printf 'unknown option: %s\n' "$1" >&2; exit 2 ;;
	esac
done

# --- the endpoint must be named, and be reachable, before anything is claimed --
# An evaluation that cannot reach its model has to say so and stop. A run that
# skipped quietly and left a green line behind would be read as evidence.
resolve_endpoint() {
	local base
	base="$(node -e '
		import("node:fs").then(fs => {
			try {
				const j = JSON.parse(fs.readFileSync(process.env.KID_EVAL_MODELS_JSON, "utf8"));
				const p = (j.providers ?? {})["'"$provider"'"];
				process.stdout.write(p?.baseUrl ?? "");
			} catch { process.stdout.write(""); }
		});' 2>/dev/null)"
	printf '%s' "${endpoint:-$base}"
}

# the path is passed in rather than derived from HOME, so that the sandboxed
# run can be pointed at the copy it was given
export KID_EVAL_MODELS_JSON="${KID_EVAL_MODELS_JSON:-$HOME/.pi/agent/models.json}"
base_url="$(resolve_endpoint)"
if [[ -z "$base_url" ]]; then
	printf 'no endpoint for provider %s, and none was given with --endpoint\n' "$provider" >&2
	printf 'say so explicitly: test/evals.sh --endpoint http://host:port/v1\n' >&2
	exit 2
fi
# the authority is what a URL is before the path, and the path matters here:
# these servers answer under /v1/models, and a probe that drops it gets a 404
# from a server that is very much alive. Splitting on the first slash after the
# scheme is the only way to keep both.
authority="$(printf '%s' "$base_url" | sed -E 's#^[A-Za-z]+://##; s#/(.*)$##')"
host_only="${authority%:*}"
port_only="$(printf '%s' "$authority" | sed -nE 's#^.*:([0-9]+)$#\1#p')"
scheme="$(printf '%s' "$base_url" | sed -nE 's#^([A-Za-z]+)://.*#\1#p')"
[[ -n "$scheme" ]] || scheme=http
printf 'endpoint      : %s://%s/models\n' "${scheme:-http}" "$authority"

probe_url="$scheme://$authority/models"
# a 404 is an answer. It says something is listening and answering, which is all
# the preflight needs to know; only a failure to connect at all means the run
# would measure nothing. Asking for /v1/models on a server that has no such route
# is not the same fact as a machine that is down.
if ! timeout 15 curl -fsS -o /dev/null "$probe_url" 2>/dev/null; then
	if ! timeout 15 curl -s -o /dev/null "$probe_url" 2>/dev/null; then
		printf '\n✗ the model endpoint at %s did not answer at all. Nothing was measured,\n' "$probe_url" >&2
		printf '  so nothing below should be read as a result.\n' >&2
		exit 3
	fi
	printf '  (note: %s answered %s, not 200; the host is there and routes it)\n' "$probe_url" "$(curl -s -o /dev/null -w %{http_code} --max-time 10 "$probe_url" 2>/dev/null || echo unknown)"
fi

# --- the sandbox run ---------------------------------------------------------
# A container would be the better isolation, but it needs a daemon to borrow and
# a rootless podman has no socket to lend. What can be had without one is still
# worth having: a new pid namespace, so no other process's command line is
# visible, and a new mount namespace, so nothing outside it is written to. The
# home directory is a copy rather than the real one. The network is shared, and
# the run says so below rather than letting the word "sandbox" imply otherwise.
if (( sandbox )); then
	command -v unshare >/dev/null 2>&1 || { printf 'unshare is needed for --sandbox\n' >&2; exit 127; }
	sandbox_home="$(mktemp -d -t kidevalsbox.XXXXXX)"
	mkdir -p "$sandbox_home/.pi/agent"
	chmod 755 "$sandbox_home"
	# the provider definition is read from the caller's own configuration and
	# copied in, so that the sandboxed run needs no home directory of its own
	# and no secret is mounted anywhere it could be written to
	for f in models.json auth.json; do
		[[ -f "$HOME/.pi/agent/$f" ]] && cp -- "$HOME/.pi/agent/$f" "$sandbox_home/.pi/agent/$f"
	done
	printf '\n▸ behavioural evaluation, isolated where isolation is possible\n'
	printf '  home   : %s (a copy; the real one cannot be touched)\n' "$sandbox_home"
	printf '  pids   : a new namespace, so no other process command line is visible\n'
	printf '  mounts : a new namespace, so nothing outside it is written to\n'
	printf '  network: NOT isolated. A private net namespace needs CAP_NET_ADMIN, which\n'
	printf '           a rootless user namespace does not have, and without it no route\n'
	printf '           can be added and the model cannot be reached at all. This run\n'
	printf '           therefore shares the host network, and says so.\n'

	unshare --map-auto --fork --pid --mount --mount-proc \
		env HOME="$sandbox_home" \
			node "$runner" --provider "$provider" --model "$model" --pi pi \
				--home "$sandbox_home" "${extra[@]}"
	exit $?
fi

# --- host run ------------------------------------------------------------------
if (( ! container )); then
	# Both judges are checked before either is trusted. The first asks whether the
# measurements mean what they say they mean; the second asks whether the rules I
# loosened in order to stop them failing good replies still fail bad ones, which is
# the danger of loosening anything. A run measured by a broken instrument is not
# evidence, and the ways this instrument goes wrong are ways it looks like success.
if [[ ! "${KID_EVAL_SKIP_SELFCHECK:-0}" == 1 ]]; then
	printf '\n▸ checking the judge before letting it judge\n'
	for check in judge.selfcheck.mjs judge.relaxations.check.mjs; do
		if ! node "$here/evals/$check"; then
			printf '\n✗ %s does not hold.\n' "$check" >&2
			printf '  Fix the judge in test/evals/ before reading anything from a run.\n' >&2
			exit 4
		fi
	done
fi

printf '\n▸ behavioural evaluation, on this machine\n'
	exec node "$runner" --provider "$provider" --model "$model" "${extra[@]}"
fi

# --- container run -------------------------------------------------------------
# The image is the `live` stage, which carries pi. The model is reached over the
# network, which is why this run is not the hermetic one. The host entry is added
# explicitly rather than inherited, so the dependency is visible in the command.
# Inside a container the host has usually already set DOCKER_HOST to a build-time
# daemon, and the docker command there is a podman shim that will obey it and then
# fail to resolve the name. The inner runtime has to be told to talk to its own
# daemon, so the variables that would send it elsewhere are cleared first.
# An empty-but-set variable is not the same thing as an unset one: podman reads a
# set CONTAINER_HOST, even empty, as an instruction about where to look. So these
# are removed and never re-exported, and the URI transport is named out loud.
unset DOCKER_HOST DOCKER_PORT DOCKER_API_ADDRESS DOCKER_TLS_VERIFY COMPOSE_PROJECT_DIR
unset CONTAINER_HOST CONTAINER_CONNECTION CONTAINER_RUNTIME
export CONTAINER_CONNECTION=unix://run/podman/podman.sock
export BUILDAH_SOCK=unix://run/podman/0/podman/podman.sock

runtimes="${DOCKER_CMD:-podman docker}"
rt=""
for c in $runtimes; do
	if command -v "$c" >/dev/null 2>&1; then rt="$c"; break; fi
done
if [[ -z "$rt" ]]; then
	printf '\n✗ --container asked for a container and no runtime was found.\n' >&2
	printf '  tried: %s\n' "$runtimes" >&2
	printf '  nothing was measured. Run without --container for the unprivileged\n' >&2
	printf '  isolation this can give you, which is what --sandbox does.\n' >&2
	exit 127
fi
if ! "$rt" info >/dev/null 2>&1; then
	printf '\n✗ --container asked for a container and %s is not reachable from here.\n' "$rt" >&2
	printf '  This is the usual outcome under a rootless podman, which exposes no\n' >&2
	printf '  API socket for a container to borrow. Nothing was measured, so nothing\n' >&2
	printf '  here should be read as a result.\n' >&2
	printf '\n  Run without --container: the sandboxed run drops privileges and its own\n' >&2
	printf '  network namespace, which is the part that matters for an evaluation.\n' >&2
	exit 125
fi

printf '\n▸ building %s (this stage installs pi, so it needs the network)\n' "$image"
"$rt" build -f "$here/Dockerfile" --target live -t "$image" "$root" >/dev/null

# pi needs to know about the provider. The two credential files are mounted read-
# only rather than copied, so that no secret is written into an image and none is
# left behind in it. They are never committed, and results name no file that holds
# a transcript.
mounts=()
for f in models.json auth.json; do
	if [[ -f "$HOME/.pi/agent/$f" ]]; then
		mounts+=(-v "$HOME/.pi/agent/$f:/home/node/.pi/agent/$f:ro")
	fi
done

addhost=()
if [[ -n "$port_only" ]]; then
	ip="$(getent hosts "$host_only" 2>/dev/null | awk '{print $1; exit}')"
	[[ -n "$ip" ]] && addhost+=(--add-host "$host_only:$ip")
fi

printf '\n▸ behavioural evaluation, in a container\n'

# the checkout is mounted read-only, which is what an evaluation should do to it:
# look and not change. The report therefore goes to a writable place outside it.
report_dir="$(mktemp -d -t kidevalout.XXXXXX)"
trap 'rm -rf -- "$report_dir"' EXIT
extra+=(--out "$report_dir")

"$rt" run --rm \
"$rt" run --rm \
	"${addhost[@]}" \
	-e NO_COLOR=1 \
	-e HOME=/home/node \
	"${mounts[@]}" \
	-v "$root:/work:ro" \
	-w /work \
	"$image" \
	node /work/test/evals/run.mjs --provider "$provider" --model "$model" --pi pi "${extra[@]}"
rc=$?
# the report is brought back when the checkout allows it; the run is the evidence either way
report_file="$(find "$report_dir" -maxdepth 1 -type f -name '*.json' -print -quit 2>/dev/null || true)"
if [[ -n "$report_file" && -w "$root/test/evals" ]]; then
	mkdir -p "$root/test/evals/results"
	cp -n -- "$report_file" "$root/test/evals/results/" 2>/dev/null || true
fi
exit $rc

