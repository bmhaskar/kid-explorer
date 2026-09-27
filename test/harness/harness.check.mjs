#!/usr/bin/env node
// Verify an INSTALLED tree for one host, against what the registry promises.
//
//   node test/harness/harness.check.mjs --harness cursor \
//        --project /tmp/proj --home /tmp/kidhome
//
// This is not the same claim as `build.mjs --verify`. That one checks the
// generator's output; this one checks the files that are actually sitting on a
// machine after the installer has run, in the places the host will really look.
// A generator can be correct and the installer still put things somewhere the
// host never reads, and that failure is invisible to both the child and the
// parent until the first session goes wrong.
//
// Exit 0 = the host would find the skill and the guard rails. Non-zero = it
// would not, and the reason is printed.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";

import { loadRegistry } from "../../adapters/registry.mjs";
import {
	NEVER_GRANT, CORE_IN_SKILL, RAIL_MUST_HOLD, MUST_SURVIVE,
	GUARD_MARK_BEGIN, GUARD_MARK_END, BODY_MARK_BEGIN, BODY_MARK_END,
} from "../../adapters/harnesses.mjs";

// ---------------------------------------------------------------------------

function arg(name, fallback) {
	const i = argv.indexOf(`--${name}`);
	if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) return argv[i + 1];
	const inline = argv.find((a) => a.startsWith(`--${name}=`));
	if (inline) return inline.slice(name.length + 3);
	return fallback;
}

const key = arg("harness");
const project = arg("project");
const home = arg("home");
const root = new URL("../..", import.meta.url).pathname;
const verbose = argv.includes("--verbose");

if (!key) {
	process.stderr.write("usage: harness.check.mjs --harness NAME --project DIR --home DIR\n");
	process.exitCode = 2;
} else {
	run();
}

function run() {
	const registry = loadRegistry().registry;
	const spec = registry[key];
	if (!spec) {
		process.stderr.write(`no harness named "${key}"\n`);
		process.exitCode = 2;
		return;
	}

	const fails = [];
	const notes = [];
	let checks = 0;
	const ok = (cond, what) => { checks++; if (cond) { if (verbose) notes.push(`  ok   ${what}`); } else fails.push(`  FAIL ${what}`); };

	const skillKind = spec.kind === "skill" || spec.kind === "both";
	const rulesKind = spec.kind === "rules" || spec.kind === "both";

	// the source of truth, to compare the installed bytes against
	const src = readFileSync(join(root, "SKILL.md"), "utf8");
	const srcBody = bodyOf(src);
	const refNames = readdirSync(join(root, "references")).sort();

	// where the host was promised the files would be, at each scope
	const scopes = [];
	if (project) scopes.push({ label: "project", base: project, dir: spec.projectDir });
	if (home && spec.homeDir) scopes.push({ label: "home", base: home, dir: spec.homeDir });

	if (!scopes.length) {
		process.stderr.write("nothing to check: neither --project nor --home resolved to a scope\n");
		process.exitCode = 1;
		return;
	}

	let sawSkillAnywhere = false;
	for (const sc of scopes) {
		if (!existsSync(sc.base)) continue;
		if (!skillKind) continue;
		const dir = join(sc.base, sc.dir, "kid-explorer");
		const skill = join(dir, "SKILL.md");
		if (!existsSync(skill)) continue;
		sawSkillAnywhere = true;

		ok(true, `${sc.label}: the host finds ${sc.dir}/kid-explorer/SKILL.md`);

		const text = readFileSync(skill, "utf8");
		for (const clause of CORE_IN_SKILL) ok(text.includes(clause), `${sc.label}: carries "${clause}"`);

		// the whole package: the body plus every reference the host could load
		const pkg = [text];
		const refDir = join(dir, "references");
		if (existsSync(refDir)) {
			const have = readdirSync(refDir).sort();
			ok(have.length === refNames.length, `${sc.label}: all ${refNames.length} references arrived (got ${have.length})`);
			for (const n of refNames) {
				if (!have.includes(n)) { ok(false, `${sc.label}: reference ${n} is missing`); continue; }
				const a = readFileSync(join(root, "references", n));
				const b = readFileSync(join(refDir, n));
				ok(a.equals(b), `${sc.label}: reference ${n} is byte-identical`);
				pkg.push(b.toString("utf8"));
			}
		} else {
			ok(false, `${sc.label}: the references directory did not arrive`);
		}
		const whole = pkg.join("\n");
		for (const clause of MUST_SURVIVE) ok(whole.includes(clause), `${sc.label}: the package carries "${clause}"`);

		ok(bodyOf(text) === srcBody, `${sc.label}: the body was not rewritten by the installer`);

		// the tool surface, as the host will read it
		const fm = frontmatterOf(text);
		const fields = fm.split("\n").map((l) => (l.match(/^([A-Za-z0-9_-]+):/) ?? [])[1]).filter(Boolean);
		const known = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools", "disallowed-tools"]);
		for (const f of fields) ok(known.has(f), `${sc.label}: frontmatter field "${f}" is a spec field`);

		const granted = (fm.match(/^allowed-tools:[ \t]*(.*)$/m) ?? [])[1] ?? "";
		const list = granted.split(",").map((x) => x.trim()).filter(Boolean);
		const banned = new Set(NEVER_GRANT.map((t) => t.toLowerCase()));
		for (const t of list) ok(!banned.has(t.toLowerCase()), `${sc.label}: was not granted "${t}"`);
		if (spec.deniedTools?.length) {
			const denied = (fm.match(/^disallowed-tools:[ \t]*(.*)$/m) ?? [])[1] ?? "";
			for (const t of spec.deniedTools) ok(denied.includes(t), `${sc.label}: was denied "${t}"`);
		}
	}

	if (skillKind && !sawSkillAnywhere) {
		ok(false, `neither scope has ${spec.projectDir ?? spec.homeDir}/kid-explorer/SKILL.md — this host would not find the skill`);
	}

	// the always-on half: the rules file the host reads before it decides anything
	if (rulesKind) {
		const base = existsSync(project) ? project : home;
		const rule = join(base ?? "", spec.rulesDir, `${spec.rulesName ?? "kid-explorer"}.${spec.rulesExt}`);
		ok(existsSync(rule), `the rule file ${spec.rulesDir}/${spec.rulesName ?? "kid-explorer"}.${spec.rulesExt} exists`);
		if (existsSync(rule)) {
			const t = readFileSync(rule, "utf8");
			ok(t.startsWith("---\n"), "the rule file opens with frontmatter");
			for (const clause of RAIL_MUST_HOLD) ok(t.includes(clause), `the rule carries "${clause}"`);
		}
	}

	if (spec.contextFile) {
		const bases = [project, home].filter(Boolean);
		let found = null;
		for (const b of bases) {
			const p = join(b, spec.contextFile);
			if (existsSync(p)) { found = p; break; }
		}
		ok(found !== null, `${spec.contextFile} was written somewhere the host reads`);
		if (found) {
			const t = readFileSync(found, "utf8");
			for (const clause of RAIL_MUST_HOLD) ok(t.includes(clause), `${spec.contextFile} carries "${clause}"`);
			const pairs = [[GUARD_MARK_BEGIN, GUARD_MARK_END, "the rail"], [BODY_MARK_BEGIN, BODY_MARK_END, "the inlined policy"]];
			for (const [b, e, label] of pairs) {
				if (!t.includes(b)) continue;
				ok(t.includes(e), `${spec.contextFile}: ${label} is closed`);
				ok(t.indexOf(b) < t.indexOf(e), `${spec.contextFile}: ${label} is not nested`);
				ok(t.split(b).length - 1 === 1, `${spec.contextFile}: ${label} appears exactly once`);
			}
			// a rules-only host gets the body inlined, and must have got all of it
			if (spec.inlineBody) {
				for (const clause of MUST_SURVIVE) ok(t.includes(clause), `${spec.contextFile} carries the inlined "${clause}"`);
			}
		}
	}

	for (const n of notes) process.stdout.write(n + "\n");
	for (const f of fails) process.stdout.write(f + "\n");
	if (fails.length) {
		process.stdout.write(`\n  ${fails.length} of ${checks} checks failed for ${key}\n`);
		process.exitCode = 1;
	} else {
		process.stdout.write(`  ${checks} checks passed for ${key}\n`);
	}
}

function bodyOf(text) {
	if (!text.startsWith("---\n")) return text;
	const end = text.indexOf("\n---\n", 3);
	return end < 0 ? text : text.slice(end + 5);
}
function frontmatterOf(text) {
	if (!text.startsWith("---\n")) return "";
	const end = text.indexOf("\n---\n", 3);
	return end < 0 ? "" : text.slice(4, end);
}
