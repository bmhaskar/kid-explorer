#!/usr/bin/env node
// Behavioural evaluation of the kid-explorer policy against a real model.
//
//   node test/evals/run.mjs --provider vllm --model qwen3.8-flash-next
//   node test/evals/run.mjs --arms body --probes war-bridge --samples 3
//   node test/evals/run.mjs --list
//
// WHY THERE ARE ARMS
//
// A single arm cannot tell two very different failures apart: a model that
// ignored the policy, and a run where the policy was never in the prompt at
// all. Both look like an unsafe reply. `none` is the control, `rail` is the
// always-on summary alone, and `body` is the whole policy. A probe that passes
// in `none` is reported as non-discriminating, because it is not testing the
// policy and must not be counted as evidence for it.
//
// WHY THE POLICY IS APPENDED RATHER THAN LOADED WITH --skill
//
// pi discloses a skill progressively: `--skill` makes the skill known by name
// and description, and the body is read only when the agent decides to reach
// for it. With `--no-tools` there is nothing to reach with, so the body never
// enters the prompt and the run measures a configuration in which the policy
// text was simply absent. That is worth knowing — it is the same progressive-
// disclosure hazard the guard rails exist for — but it is not a test of the
// policy, so the evaluation puts the text where it will certainly be read.

import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";

import { PROBES, ARMS, SANCTIONED, REPORT_SCHEMA } from "./probes.mjs";
import { GUARD_RAIL } from "../../adapters/harnesses.mjs";
import { judge } from "./judge.mjs";

const root = new URL("../..", import.meta.url).pathname;

// the policy files for this run live here, and are removed when it ends
const scratch = mkdtempSync(join(tmpdir(), "kideval-"));

// ---------------------------------------------------------------------------

function arg(name, fallback) {
	const i = argv.indexOf(`--${name}`);
	if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) return argv[i + 1];
	const inline = argv.find((a) => a.startsWith(`--${name}=`));
	return inline ? inline.slice(name.length + 3) : fallback;
}
const flag = (name) => argv.includes(`--${name}`);

const home = arg("home", process.env.HOME ?? tmpdir());
const provider = arg("provider", process.env.PI_PROVIDER ?? "vllm");
const model = arg("model", process.env.PI_MODEL ?? "qwen3.8-flash-next");
const piBin = arg("pi", process.env.PI_BIN ?? "pi");
const samples = Math.max(1, Number(arg("samples", "2")) || 2);
const outDir = arg("out", join(root, "test", "evals", "results"));
const wantArms = String(arg("arms", "none,rail,body")).split(",").map((x) => x.trim()).filter(Boolean);
const wantProbes = String(arg("probes", "all")).split(",").map((x) => x.trim()).filter(Boolean);
const timeoutMs = Number(arg("timeout", "240000")) || 240000;

if (flag("list")) {
	for (const p of PROBES) process.stdout.write(`${p.id.padEnd(22)} ${p.arm.padEnd(9)} ${p.note}\n`);
	process.exitCode = 0;
}

// ---------------------------------------------------------------------------
// the policy text for each arm

function policyFiles(arm) {
	if (arm === "none") return [];
	if (arm === "rail") return [GUARD_RAIL.join("\n")];
	const body = readFileSync(join(root, "SKILL.md"), "utf8");
	const names = ["content-policy.md", "websearch-lens.md", "reframing.md", "emotional-safety.md", "comms-style.md"];
	const extra = names
		.filter((n) => existsSync(join(root, "references", n)))
		.map((n) => `\n\n--- references/${n} ---\n\n` + readFileSync(join(root, "references", n), "utf8"));
	return [body, ...extra];
}

// the measurements live in judge.mjs, so that the self-check exercises the very
// same functions the runner does rather than a copy of them

// ---------------------------------------------------------------------------
// one turn, through pi, exactly as the child's agent would assemble it

function ask(arm, prompt) {
	const files = policyFiles(arm);
	const args = [
		"-p",
		"--provider", provider,
		"--model", model,
		// no tools: the policy is a way of speaking, not a capability, and a
		// tool call would let the reply depend on the web rather than on the lens
		"--no-tools", "--no-skills", "--no-extensions", "--no-context-files", "--no-session",
		"--thinking", "off",
	];
	// the policy goes to a file rather than onto the command line: the whole
	// of it runs to tens of kilobytes, and a shell or an argument limit should
	// not be part of what an evaluation depends on
	for (const [i, text] of files.entries()) {
		const path = join(scratch, `policy-${arm}-${i}.md`);
		writeFileSync(path, text);
		args.push("--append-system-prompt", path);
	}
	args.push("--", prompt);

	const r = spawnSync(piBin, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: timeoutMs });
	if (r.error) return { ok: false, why: `cannot run ${piBin}: ${r.error.message}` };
	if (r.status !== 0) {
		return { ok: false, why: `pi exited ${r.status}: ${(r.stderr ?? "").split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 220)}` };
	}
	// pi may print a startup banner on stdout; it is not part of the reply
	const text = (r.stdout ?? "").split("\n").filter((l) => !/^\[pi-[a-z-]+\]/.test(l)).join("\n").trim();
	if (!text) return { ok: false, why: "the model returned nothing at all" };
	return { ok: true, text };
}

// ---------------------------------------------------------------------------

function main() {
	const arms = wantArms.filter((a) => ARMS[a]);
	const probes = wantProbes.includes("all") ? PROBES : PROBES.filter((p) => wantProbes.includes(p.id));
	if (!arms.length) { process.stderr.write(`no such arm among: ${wantArms.join(", ")}\n`); return 2; }
	if (!probes.length) { process.stderr.write(`no such probe among: ${wantProbes.join(", ")}\n`); return 2; }

	// A run that cannot reach the model must say so, loudly, and fail. An
	// evaluation that skips quietly and leaves a green line behind is worse
	// than no evaluation, because it is read as evidence.
	{
		const probe = ask(arms[0], "Say only the word READY.");
		if (!probe.ok || !/\bREADY\b/i.test(probe.text)) {
			process.stderr.write(
				"\n✗ the evaluation cannot reach the model.\n" +
				`    provider: ${provider}\n    model:    ${model}\n    binary:   ${piBin}\n` +
				`    reason:   ${(probe.why ?? `reply was ${JSON.stringify(probe.text?.slice(0, 60))}`).slice(0, 300)}\n\n` +
				"  nothing was measured, so nothing below should be read as a result.\n\n",
			);
			return 3;
		}
	}

	const started = new Date().toISOString();
	const results = [];
	let hardFailures = 0;

	process.stdout.write(`\nkid-explorer · behavioural evaluation\n`);
	process.stdout.write(`  model ${provider}/${model} · ${probes.length} probes × ${arms.length} arms × ${samples} sample(s)\n\n`);

	for (const probe of probes) {
		const row = { id: probe.id, arm: probe.arm, note: probe.note, arms: {} };
		process.stdout.write(`  ${probe.id}\n`);
		for (const arm of arms) {
			let passed = 0;
			// samples that never reached the model, counted apart and put into nobody's
			// denominator: a sample the model was never asked is not a sample the policy
			// failed. See the note above about the 400 this endpoint answers sometimes.
			let unreachable = 0;
			const firstFails = [];
			const unreachableWhys = []; // the harness could not ask; not the skill's doing
			let firstReply = null;   // a reply that failed, shown beside its failures
			let firstGoodReply = null; // a reply that passed, shown when nothing failed
			for (let i = 0; i < samples; i++) {
				const r = ask(arm, probe.prompt);
				if (!r.ok) {
					unreachable++;
					// the reason is kept apart from the verdicts. An unreachable sample is
					// not a sample the policy failed, and putting its reason in among the
					// failures would let an infrastructure error be counted as a safety
					// breach — which is exactly the thing a parent must never be told.
					unreachableWhys.push(r.why);
					if (firstReply === null) firstReply = `(no reply: ${r.why})`;
					continue;
				}
				const fails = judge(probe, r.text, SANCTIONED);
				if (!fails.length) { if (firstGoodReply === null) firstGoodReply = r.text; passed++; continue; }
				// the reply shown is the reply judged, and not merely the first one that
				// came back. The two are easy to conflate and the conflation is a lie in
				// the report: a compliant reply printed above the failures of another
				// reads exactly like a compliant reply that was failed for nothing.
				if (firstFails.length === 0) { firstReply = r.text; firstFails.push(...fails); }
			}
			const measured = samples - unreachable;
			// nothing was measured, so nothing is claimed: not a pass, and not a failure
			// either, and the difference is the whole of the point of this counter
			const ok = measured > 0 && passed === measured;
			// what is shown is what was judged: the failures of a failing arm, or a
			// passing reply when the arm passed, never a mixture of the two
			const shown = firstReply ?? firstGoodReply;
			row.arms[arm] = { passed, samples, measured, unreachable, unreachableWhys: unreachableWhys.slice(0, 2), fails: firstFails.slice(0, 3), reply: shown };
			if (arm === "body" && measured > 0 && !ok) hardFailures++;
			const mark = measured === 0 ? "?" : (ok ? "✓" : (passed > 0 ? "~" : "✗"));
			const share = measured === 0 ? " 0/0" : `${String(passed).padStart(2)}/${measured}`;
			const aside = unreachable ? `  (${unreachable} never reached the model)` : "";
			process.stdout.write(`    ${mark} ${arm.padEnd(6)} ${share}  ${ARMS[arm].label}${aside}\n`);
			for (const f of (row.arms[arm].fails ?? []).slice(0, 2)) {
				process.stdout.write(`        ${f}\n`);
			}
		}
		// a probe that passes with no policy at all is not testing the policy
		if (row.arms.none && row.arms.none.passed === row.arms.none.samples) {
			row.nondiscriminating = true;
			process.stdout.write(`        · passes with no policy at all: this probe does not test the lens\n`);
		}
		results.push(row);
	}

	const discriminating = results.filter((r) => !r.nondiscriminating && r.arms.none);
	const bodyPass = results.filter((r) => r.arms.body?.passed === samples).length;
	const summary = {
		schema: REPORT_SCHEMA,
		generated: started,
		provider, model, pi: piBin,
		samples,
		probes: probes.length,
		arms: arms,
		bodyPass,
		bodyTotal: probes.length,
		nondiscriminating: results.filter((r) => r.nondiscriminating).map((r) => r.id),
		discriminatingCount: discriminating.length,
		results,
	};

	mkdirSync(outDir, { recursive: true });
	const stamp = started.replace(/[:.]/g, "-").slice(0, 19);
	const file = join(outDir, `${stamp}-${provider}-${model.replace(/[^\w.-]/g, "_")}.json`);
	writeFileSync(file, JSON.stringify(summary, null, 2));

	process.stdout.write(`\n  whole policy: ${bodyPass}/${probes.length} probes passed every sample\n`);
	process.stdout.write(`  discriminating probes: ${discriminating.length}/${probes.length}\n`);
	if (summary.nondiscriminating.length) {
		process.stdout.write(`  not testing the lens (passed with no policy): ${summary.nondiscriminating.join(", ")}\n`);
	}
	process.stdout.write(`  report: ${file}\n\n`);
	process.stdout.write(`  transcripts are not written here on purpose: they hold a child's\n`);
	process.stdout.write(`  shape of asking, and the model's words are not ours to publish.\n\n`);

	return hardFailures ? 1 : 0;
}

process.on("exit", () => {
	try {
		rmSync(scratch, { recursive: true, force: true });
	} catch {
		// a left-behind temporary directory is not worth failing the run over
	}
});

process.exitCode = main();
