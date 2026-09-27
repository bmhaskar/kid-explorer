#!/usr/bin/env bash
# Optional live smoke test: does pi really load this skill and extension without
# complaint? Needs the pi binary, so it is opt-in:
#
#     PI_TEST_LIVE=1 PI_BIN=/path/to/pi test/70-pi-live.sh
#     test/docker-test.sh --live            # builds pi into the image and runs it
#
# Strategy: start pi for real, with an invalid API key and a nonexistent model.
# pi loads extensions and discovers skills during startup, *then* contacts the
# provider. So if the run reaches the provider and comes back with an auth or
# network error, that is positive proof that startup — including our package —
# completed cleanly. Anything of ours that threw on the way in shows up as a
# stack trace and fails the suite.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/.." && pwd -P)"
# shellcheck disable=SC1091
source "$here/lib/assert.sh"

printf 'pi-live\n'

if [[ "${PI_TEST_LIVE:-0}" != 1 ]]; then
	kid_skip "live pi load" "set PI_TEST_LIVE=1 to enable"
	finish pi-live
	exit 0
fi

pi_bin="${PI_BIN:-}"
if [[ -z "$pi_bin" ]]; then
	if command -v pi >/dev/null 2>&1; then
		pi_bin="$(command -v pi)"
	else
		for c in "$HOME"/.local/share/mise/installs/pi/*/pi/pi /usr/local/bin/pi; do
			[[ -x "$c" ]] && { pi_bin="$c"; break; }
		done
	fi
fi
if [[ -z "$pi_bin" || ! -x "$pi_bin" ]]; then
	kid_skip "live pi load" "no pi binary found (set PI_BIN=/path/to/pi)"
	finish pi-live
	exit 0
fi
kid_pass "using pi at $pi_bin"
printf '    pi %s\n' "$("$pi_bin" --version 2>/dev/null | head -1)"

# --- an isolated config, so the developer's own pi is never touched ---------
scratch="$(mktemp -d -t kidlive.XXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
export HOME="$scratch"
export PI_HOME="$scratch/.pi/agent"
export PI_OFFLINE=1
export PI_TELEMETRY=0
unset PI_KID_EXPLORER || true

"$root/install.sh" >/dev/null 2>&1
assert_file "$PI_HOME/skills/kid-explorer/SKILL.md"
assert_file "$PI_HOME/extensions/kid-explorer-autostart.ts"

# --- one real pi invocation ---------------------------------------------------
# A real provider id with a nonexistent model and a deliberately bad key: pi
# must get all the way to the HTTP call before anything can fail.
run_pi() { # extra args…
	timeout 120 "$pi_bin" \
		--provider google \
		--model google/kid-explorer-nonexistent-model \
		--api-key invalid-key-for-load-test \
		--no-builtin-tools --no-themes --no-context-files \
		--offline --verbose \
		"$@" \
		--print "hello" 2>&1 || true
}

out="$(run_pi)"
printf '%s\n' "$out" | sed 's/^/    | /' | head -20

# --- positive proof that startup finished ----------------------------------
if printf '%s\n' "$out" | grep -qiE '"error"|api key|invalid|unauthorized|forbidden|getaddrinfo|network|connect|resolv|econn|timed out|offline|fetch failed|could not (fetch|resolve|connect)|unable to (reach|connect)|no route to host|temporary failure|service unavailable|eai_|econnref|ehostun|etimedout'; then
	kid_pass "pi completed startup and reached the provider boundary"
else
	kid_fail "pi never reached the provider — startup probably aborted"
	printf '%s\n' "$out" | sed 's/^/      /' | head -20
fi

# --- nothing of ours may have thrown on the way in -------------------------
for pat in \
	'SyntaxError|ReferenceError|TypeError|ReferenceError' \
	'at [^ ]*kid-explorer-autostart\.ts' \
	'kid-explorer.*malformed|malformed.*SKILL' \
	'cannot (load|read|parse).*kid-explorer' \
	'failed to load (extension|skill)' \
	'uncaught' ; do
	assert_no_match <(printf '%s\n' "$out") "$pat"
done

# --- the gate must keep the extension inert --------------------------------
assert_no_match <(printf '%s\n' "$out") 'PI_KID_EXPLORER'
if printf '%s\n' "$out" | grep -qi 'sendUserMessage'; then
	kid_fail "the extension spoke while its gate was closed"
else
	kid_pass "extension stayed inert with PI_KID_EXPLORER unset"
fi

# --- now open the gate and require the same clean load ---------------------
export PI_KID_EXPLORER=1
out2="$(run_pi)"
for pat in 'SyntaxError|ReferenceError|TypeError' 'at [^ ]*kid-explorer-autostart\.ts' 'uncaught'; do
	assert_no_match <(printf '%s\n' "$out2") "$pat"
done
kid_pass "extension loaded with the gate open, no load-time error"

# --- and force-load both artefacts by explicit path ------------------------
out3="$(run_pi --extension "$root/extensions/kid-explorer-autostart.ts" \
              --skill "$root/SKILL.md")"
for pat in 'SyntaxError|ReferenceError|TypeError' 'uncaught' 'at [^ ]*kid-explorer'; do
	assert_no_match <(printf '%s\n' "$out3") "$pat"
done
kid_pass "explicit --extension and --skill loads were accepted"

# --- a malformed sibling must be reported, proving the checks above can fail
# If pi silently tolerated a broken skill, the "no load-time error" assertions
# would be worthless. Give it something broken and require a complaint.
broken="$scratch/.pi/agent/skills/broken-skill/SKILL.md"
mkdir -p -- "$(dirname -- "$broken")"
printf 'no frontmatter at all, just prose\n' > "$broken"
out4="$(run_pi --skill "$broken")"
if printf '%s\n' "$out4" | grep -qiE 'malformed|invalid|not loaded|failed to load|without frontmatter|missing'; then
	kid_pass "the loader does report a malformed skill — the assertions above are live"
else
	kid_note "loader stayed quiet on a malformed skill — treat the load assertions as weak"
fi

finish pi-live
