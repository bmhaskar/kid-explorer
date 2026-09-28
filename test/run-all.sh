#!/usr/bin/env bash
# Run the whole kid-explorer suite, or a subset.
#
#   test/run-all.sh                  everything
#   test/run-all.sh --only install   only suites whose name contains "install"
#   test/run-all.sh --list           list the suites and exit
#   test/run-all.sh --strict         treat a skipped suite as a failure
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

only=""
strict=0
list=0
while (($#)); do
	case "$1" in
		--only) only="${2:-}"; shift 2 ;;
		--only=*) only="${1#*=}"; shift ;;
		--strict) strict=1; shift ;;
		--list) list=1; shift ;;
		-h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}"; exit 0 ;;
		*) printf 'unknown option: %s\n' "$1" >&2; exit 2 ;;
	esac
done

mapfile -t suites < <(find "$here" -maxdepth 1 -type f -name '[0-9]*.sh' | sort)
(( ${#suites[@]} )) || { printf 'no suites found in %s\n' "$here" >&2; exit 1; }

if (( list )); then
	for s in "${suites[@]}"; do printf '%s\n' "$(basename -- "$s" .sh)"; done
	exit 0
fi

if [[ -t 1 && "${NO_COLOR:-0}" != 1 ]]; then
	B=$'\e[1m'; OK=$'\e[32m'; BAD=$'\e[31m'; DIM=$'\e[2m'; OFF=$'\e[0m'
else
	B='' OK='' BAD='' DIM='' OFF=''
fi

name_width=22

row() { # symbol colour label timing
	local sym="$1" col="$2" label="$3" ms="$4"
	printf "  %s%s%s  %-*s  %s(%s ms)%s\n" "$col" "$sym" "$OFF" "$name_width" "$label" "$DIM" "$ms" "$OFF"
}

printf '%s\n' "${B}kid-explorer · test suite${OFF}"
node_ver="$(node -p 'process.versions.node' 2>/dev/null || echo 'n/a')"
printf '  %s%d suites · node %s · %s%s\n\n' "$DIM" "${#suites[@]}" "$node_ver" "$(uname -srm)" "$OFF"

ran=0 passed=0 failed=0 skipped=0
declare -a report=()
t_all=$(date +%s%N)

for s in "${suites[@]}"; do
	name="$(basename -- "$s" .sh)"
	# a comma separates alternatives, so that one invocation can name more than one
	# suite. Plain substring matching cannot, however useful it otherwise is, select
	# a pair of suites whose names share nothing; "--only pi-live,skill-loads" asks
	# for both, and each field is matched exactly as the whole string used to be, so
	# nothing that passed before this change stops passing because of it.
	if [[ -n "$only" ]]; then
		matched=0
		IFS=, read -ra alts <<<"$only" || true
		for a in "${alts[@]}"; do
			[[ -n "$a" && "$name" == *"$a"* ]] && { matched=1; break; }
		done
		(( matched )) || continue
	fi

	ran=$((ran + 1))
	t0=$(date +%s%N)
	if out="$(bash "$s" 2>&1)"; then rc=0; else rc=$?; fi
	t1=$(date +%s%N)
	ms=$(( (t1 - t0) / 1000000 ))

	if grep -q '(skipped:' <<<"$out" && ! grep -q '✗' <<<"$out"; then
		skipped=$((skipped + 1))
		row '~' "$DIM" "$name" "$ms"
		report+=("$name|skip")
	elif (( rc == 0 )); then
		passed=$((passed + 1))
		row '✓' "$OK" "$name" "$ms"
		report+=("$name|pass")
	else
		failed=$((failed + 1))
		row '✗' "$BAD" "$name" "$ms"
		report+=("$name|FAIL")
		printf '%s\n' "$out" | sed 's/^/      /'
	fi
done

t_end=$(date +%s%N)
total_ms=$(( (t_end - t_all) / 1000000 ))
printf '\n%s%s/%s suites passed%s · %s skipped · %sms\n' \
	"$B" "$passed" "$ran" "$OFF" "$skipped" "$total_ms"

if (( failed )); then
	printf '\n%sfailing suites:%s\n' "$B" "$OFF"
	for r in "${report[@]}"; do
		[[ "${r##*|}" == "FAIL" ]] && printf '  %s✗%s %s\n' "$BAD" "$OFF" "${r%%|*}"
	done
fi

if (( strict && skipped )); then
	failed=$((failed + 1))
	printf '%s--strict: %s skipped suite(s) counted as failure%s\n' "$BAD" "$skipped" "$OFF"
fi

(( failed == 0 )) || exit 1
