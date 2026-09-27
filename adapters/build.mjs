#!/usr/bin/env node
// Generate the per-host adapters from the registry. Everything under build/ is
// produced by this file and nothing under it is edited by hand.
//
//   adapters/build.mjs --list
//   adapters/build.mjs --harness all --out build
//   adapters/build.mjs --harness cursor --scope project --out build
//   adapters/build.mjs --harness windsurf --kind rules --rules-dir .windsurf/rules \
//                      --rules-ext mdc --context-file AGENTS.md --out build
//   adapters/build.mjs --verify all --out build
//
// The body of SKILL.md is never rewritten, only its frontmatter is edited, so
// the safety text is one text for every host. The portability suite asserts
// that the bytes of the body are identical across all of them: N copies of a
// policy is N chances to drift, and this is the property that keeps it from
// happening quietly.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { argv } from "node:process";

import { loadRegistry, knownNames } from "./registry.mjs";
import {
	MUST_SURVIVE, CORE_IN_SKILL, RAIL_MUST_HOLD, GUARD_RAIL,
	GUARD_MARK_BEGIN, GUARD_MARK_END, BODY_MARK_BEGIN, BODY_MARK_END, NEVER_GRANT,
} from "./harnesses.mjs";

const root = new URL("..", import.meta.url).pathname;
const SKILL_SRC = join(root, "SKILL.md");
const REFS_SRC = join(root, "references");

// ---------------------------------------------------------------------------
// argument handling

function parseArgs(argvSlice) {
	const opts = { harness: ["generic"], out: "build", scope: "project", dryRun: false, inPlace: false, mode: "build", overrides: {} };
	for (let i = 0; i < argvSlice.length; i++) {
		const a = argvSlice[i];
		const next = () => argvSlice[++i];
		switch (a) {
			case "--harness": case "-h": opts.harness = String(next()).split(",").map((s) => s.trim()).filter(Boolean); break;
			case "--out": case "-o": opts.out = next(); break;
			case "--scope": case "-s": opts.scope = next(); break;
			case "--dry-run": opts.dryRun = true; break;
			// write straight into the destination instead of into a per-host
			// staging subtree, so that hosts which share a context file merge
			// into it rather than overwriting one another
			case "--in-place": opts.inPlace = true; break;
			case "--list": opts.mode = "list"; break;
			case "--verify": {
				// `next` is a function, so `next ?? "all"` is always truthy and would
				// stringify an undefined read into the literal word "undefined". Peek
				// instead, and only consume the argument if it is a value.
				opts.mode = "verify";
				const v = argvSlice[i + 1];
				if (v !== undefined && !v.startsWith("--")) { i++; opts.harness = v.split(",").map((x) => x.trim()).filter(Boolean); }
				else opts.harness = ["all"];
				break;
			}
			case "--kind": opts.overrides.kind = next(); break;
			case "--rules-dir": opts.overrides.rulesDir = next(); break;
			case "--rules-ext": opts.overrides.rulesExt = next(); break;
			case "--rules-name": opts.overrides.rulesName = next(); break;
			case "--context-file": opts.overrides.contextFile = next(); break;
			case "--allow-tools": opts.overrides.allowedTools = String(next()).split(",").map((s) => s.trim()).filter(Boolean); break;
			case "--deny-tools": opts.overrides.deniedTools = String(next()).split(",").map((s) => s.trim()).filter(Boolean); break;
			case "--label": opts.overrides.label = next(); break;
			case "--help":
				process.stdout.write(readFileSync(new URL("./README.md", import.meta.url), "utf8"));
				return null;
			default:
				if (a.startsWith("--harness=")) { opts.harness = a.slice(10).split(",").map((s) => s.trim()); break; }
				throw new Error(`unknown option: ${a}`);
		}
	}
	if (!["project", "home", "both"].includes(opts.scope)) {
		throw new Error(`--scope must be project, home, or both (got "${opts.scope}")`);
	}
	return opts;
}

// ---------------------------------------------------------------------------
// frontmatter surgery: replace in place, leave the body alone

function splitFrontmatter(text) {
	if (!text.startsWith("---\n")) throw new Error("SKILL.md does not open with frontmatter");
	const end = text.indexOf("\n---\n", 3);
	if (end < 0) throw new Error("SKILL.md frontmatter is never closed");
	return {
		fm: text.slice(4, end),
		body: text.slice(end + 5),
	};
}

function buildFrontmatter(fmText, spec) {
	const lines = fmText.split("\n");
	const out = [];
	let sawAllowed = false;
	for (const line of lines) {
		if (/^allowed-tools:/.test(line)) {
			sawAllowed = true;
			out.push(`allowed-tools: ${(spec.allowedTools ?? []).join(", ")}`);
			continue;
		}
		if (/^disallowed-tools:/.test(line)) continue; // re-emitted below, never duplicated
		out.push(line);
	}
	if (!sawAllowed && (spec.allowedTools ?? []).length) {
		const at = out.findIndex((l) => /^description:/.test(l));
		out.splice(at + 1, 0, `allowed-tools: ${spec.allowedTools.join(", ")}`);
	} else if (!sawAllowed) {
		// a host with no allowlist still needs the field present and empty rather
		// than absent, so that nothing inherited from the source is pre-approved
		out.push("allowed-tools:");
	}
	if ((spec.deniedTools ?? []).length) {
		const at = out.findIndex((l) => /^allowed-tools:/.test(l));
		out.splice(at + 1, 0, `disallowed-tools: ${spec.deniedTools.join(", ")}`);
	}
	return out.join("\n");
}

function yamlScalars(obj) {
	const q = (v) => {
		if (typeof v === "boolean" || typeof v === "number") return String(v);
		const s = String(v ?? "");
		if (s === "") return '""';
		if (/^[\w./ -]+$/.test(s) && !/^(true|false|yes|no|null|~)$/i.test(s)) return s;
		return JSON.stringify(s);
	};
	return Object.entries(obj).map(([k, v]) => `${k}: ${q(v)}`).join("\n");
}

// ---------------------------------------------------------------------------
// the guard rail, written idempotently between two markers

function railBlock(contextFile) {
	return [
		GUARD_MARK_BEGIN,
		`<!-- source: kid-explorer · host: ${contextFile ?? "rules file"} · regenerate with adapters/build.mjs -->`,
		"",
		...GUARD_RAIL,
		"",
		GUARD_MARK_END,
	].join("\n");
}

function spliceRail(existing, block) {
	const b = existing.indexOf(GUARD_MARK_BEGIN);
	const e = existing.indexOf(GUARD_MARK_END);
	if (b >= 0 && e >= b) {
		const after = existing.slice(e + GUARD_MARK_END.length);
		return existing.slice(0, b) + block + after;
	}
	if (b >= 0 || e >= 0) {
		// one marker present without the other: a hand-edited file. Replace the
		// whole tail rather than nest a second rail inside a broken one.
		return existing.slice(0, Math.min(b < 0 ? existing.length : b, e < 0 ? existing.length : e)).trimEnd()
			+ "\n\n" + block + "\n";
	}
	return existing.trimEnd() + (existing.trim() ? "\n\n" : "") + block + "\n";
}

// The inlined policy block. A rules-only host has no file to reach for the
// detail later, so the whole body has to be present up front. It is kept in
// its own markers so that the short rail and the full text can be regenerated
// apart, and so that a hand-edit to one cannot strand the other.
function spliceBody(existing, block) {
	const b = existing.indexOf(BODY_MARK_BEGIN);
	const e = existing.indexOf(BODY_MARK_END);
	if (b >= 0 && e >= b) {
		return existing.slice(0, b) + block + existing.slice(e + BODY_MARK_END.length);
	}
	if (b >= 0 || e >= 0) {
		const cut = Math.min(b < 0 ? existing.length : b, e < 0 ? existing.length : e);
		return existing.slice(0, cut).trimEnd() + "\n\n" + block + "\n";
	}
	return existing.trimEnd() + (existing.trim() ? "\n\n" : "") + block + "\n";
}

function bodyBlock(label, bodyText) {
	return [
		BODY_MARK_BEGIN,
		`<!-- the whole kid-explorer policy, inlined because ${label} has no skill file to load on demand -->`,
		"",
		bodyText.trimEnd(),
		"",
		BODY_MARK_END,
	].join("\n");
}

// ---------------------------------------------------------------------------
// the invariants, enforced on everything this program writes

// Which clauses are demanded depends on which artefact is in hand: see the
// comment on CORE_IN_SKILL in harnesses.mjs. One list for all three would make
// the check either vacuous or a false alarm.
function assertInvariants(label, text, clauses) {
	const missing = clauses.filter((clause) => !text.includes(clause));
	if (missing.length) {
		throw new Error(`${label} lost ${missing.length} safety clause(s):\n    ${missing.join("\n    ")}`);
	}
}

// ---------------------------------------------------------------------------
// emission

const written = [];

function emit(path, content, dryRun) {
	written.push(path);
	if (dryRun) {
		process.stdout.write(`  would write ${path}\n`);
		return;
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

function copyRefs(dest, dryRun) {
	for (const n of readdirSync(REFS_SRC).sort()) {
		const src = join(REFS_SRC, n);
		const dst = join(dest, "references", n);
		written.push(dst);
		if (dryRun) { process.stdout.write(`  would copy ${dst}\n`); continue; }
		mkdirSync(dirname(dst), { recursive: true });
		writeFileSync(dst, readFileSync(src));
	}
}

function buildOne(key, spec, outRoot, opts) {
	// in place, the destination root IS the tree the host reads; staged, each
	// host gets its own subtree and the installer moves the files afterwards
	const destBase = opts.inPlace ? outRoot : join(outRoot, key);
	const made = [];
	const skillKind = spec.kind === "skill" || spec.kind === "both";
	const rulesKind = spec.kind === "rules" || spec.kind === "both";

	const src = readFileSync(SKILL_SRC, "utf8");
	const { fm, body } = splitFrontmatter(src);

	if (skillKind && (opts.scope === "project" || opts.scope === "both")) {
		const dest = join(destBase, spec.projectDir, "kid-explorer");
		const out = `---\n${buildFrontmatter(fm, spec)}\n---\n${body}`;
		assertInvariants(`${key} SKILL.md`, out, CORE_IN_SKILL);
		emit(join(dest, "SKILL.md"), out, opts.dryRun);
		copyRefs(dest, opts.dryRun);
		made.push(relative(outRoot, join(dest, "SKILL.md")));
		if (key === "codex") {
			const yaml = [
				"interface:",
				`  display_name: "Kid Explorer"`,
				`  short_description: "Age-appropriate companion for a 12-year-old, with content and emotional guard rails."`,
				"policy:",
				"  allow_implicit_invocation: true",
				"",
			].join("\n");
			emit(join(dest, "agents", "openai.yaml"), yaml, opts.dryRun);
			made.push(relative(outRoot, join(dest, "agents", "openai.yaml")));
		}
	}

	if (skillKind && (opts.scope === "home" || opts.scope === "both") && spec.homeDir) {
		const dest = join(opts.inPlace ? outRoot : join(destBase, "HOME"), spec.homeDir, "kid-explorer");
		const out = `---\n${buildFrontmatter(fm, spec)}\n---\n${body}`;
		assertInvariants(`${key} home SKILL.md`, out, CORE_IN_SKILL);
		emit(join(dest, "SKILL.md"), out, opts.dryRun);
		copyRefs(dest, opts.dryRun);
		made.push(relative(outRoot, join(dest, "SKILL.md")));
	}

	// the rules file and the context file belong to the project tree, which is
	// where the host looks for them; the home scope carries only the skill itself
	const projectScoped = opts.scope === "project" || opts.scope === "both";

	if (rulesKind && projectScoped) {
		const rulePath = join(destBase, spec.rulesDir, `${spec.rulesName ?? "kid-explorer"}.${spec.rulesExt}`);
		const rule = [
			"---",
			yamlScalars(spec.rulesFrontmatter ?? {}),
			"---",
			"",
			...GUARD_RAIL,
			"",
		].join("\n");
		assertInvariants(`${key} rule`, rule, RAIL_MUST_HOLD);
		emit(rulePath, rule, opts.dryRun);
		made.push(relative(outRoot, rulePath));
	}

	if (spec.contextFile && projectScoped) {
		const ctxPath = join(destBase, spec.contextFile);
		let existing = "";
		if (!opts.dryRun && existsSync(ctxPath)) existing = readFileSync(ctxPath, "utf8");
		let merged = spliceRail(existing, railBlock(spec.contextFile));
		if (rulesKind && spec.inlineBody) {
			// the rail is a summary; on a host with nothing to load later, the
			// summary is all that would ever arrive, and that is not sufficient
			merged = spliceBody(merged, bodyBlock(spec.label, body));
			assertInvariants(`${key} inlined policy`, merged, MUST_SURVIVE);
		}
		assertInvariants(`${key} ${spec.contextFile}`, merged, RAIL_MUST_HOLD);
		emit(ctxPath, merged, opts.dryRun);
		made.push(relative(outRoot, ctxPath));
	}

	return made;
}

// ---------------------------------------------------------------------------
// verification of a build that already exists

function verifyOne(key, spec, outRoot, inPlace, scope) {
	const destBase = inPlace ? outRoot : join(outRoot, key);
	const problems = [];
	const files = [];
	const skillKind = spec.kind === "skill" || spec.kind === "both";
	const rulesKind = spec.kind === "rules" || spec.kind === "both";

	const projectScoped = scope === "project" || scope === "both";
	const skillDir = scope === "home" ? (spec.homeDir ?? spec.projectDir) : spec.projectDir;
	if (skillKind && skillDir) files.push(join(destBase, skillDir, "kid-explorer", "SKILL.md"));
	if (rulesKind && projectScoped) files.push(join(destBase, spec.rulesDir, `${spec.rulesName ?? "kid-explorer"}.${spec.rulesExt}`));
	if (spec.contextFile && projectScoped) files.push(join(destBase, spec.contextFile));

	// A rules-only host has no skill to install and no home-scoped half at all,
	// so there is nothing here to be missing. Reporting a loss in that case would
	// be reporting a loss of files that were never meant to exist in this scope,
	// and the installer would refuse a correct installation over it.
	if (!files.length) return [];

	const packageTexts = [];
	for (const f of files) {
		if (!existsSync(f)) { problems.push(`missing: ${relative(outRoot, f)}`); continue; }
		const text = readFileSync(f, "utf8");
		packageTexts.push(text);
		const isSkill = f.endsWith("SKILL.md");
		const set = isSkill ? CORE_IN_SKILL : RAIL_MUST_HOLD;
		for (const clause of set) {
			if (!text.includes(clause)) problems.push(`${relative(outRoot, f)} lost "${clause}"`);
		}
	}

	// the references are copied verbatim, so together with SKILL.md they are the
	// whole of what a host could load; the package-wide clauses are proven there
	const refDir = join(destBase, skillDir ?? ".", "kid-explorer", "references");
	if (existsSync(refDir)) {
		for (const n of readdirSync(refDir)) packageTexts.push(readFileSync(join(refDir, n), "utf8"));
	}
	// a rules-only host has no references directory, so its inlined block in the
	// context file is the only place the package clauses could have landed
	const whole = packageTexts.join("\n");
	for (const clause of MUST_SURVIVE) {
		if (!whole.includes(clause)) problems.push(`${key}: the package lost "${clause}"`);
	}

	// the body must be the same bytes for every host
	if (skillKind) {
		const { body } = splitFrontmatter(readFileSync(SKILL_SRC, "utf8"));
		const built = readFileSync(join(destBase, skillDir, "kid-explorer", "SKILL.md"), "utf8");
		const builtBody = splitFrontmatter(built).body;
		if (builtBody !== body) problems.push(`${key}: the body drifted from SKILL.md — only the frontmatter may differ`);
	}

	// no host may be handed a shell, however its tools happen to be named
	const fmText = skillKind && skillDir ? readFileSync(join(destBase, skillDir, "kid-explorer", "SKILL.md"), "utf8") : "";
	const allowedLine = /^allowed-tools:\s*(.*)$/m.exec(fmText)?.[1] ?? "";
	const banned = new Set(NEVER_GRANT.map((t) => t.toLowerCase()));
	for (const t of allowedLine.split(",").map((x) => x.trim()).filter(Boolean)) {
		if (banned.has(t.toLowerCase())) {
			problems.push(`${key}: allowed-tools grants "${t}", which no child-facing skill may be handed`);
		}
	}
	return problems;
}

// ---------------------------------------------------------------------------

function main() {
	let opts;
	try {
		opts = parseArgs(argv.slice(2));
	} catch (e) {
		process.stderr.write(`kid-explorer build: ${e.message}\n`);
		return 2;
	}
	if (opts === null) return 0;

	let registry, problems;
	try {
		({ registry, problems } = loadRegistry({ strict: false }));
	} catch (e) {
		process.stderr.write(`${e.message}\n`);
		return 3;
	}
	for (const p of problems) {
		process.stderr.write(`  ! ${p.key} (${p.path}): ${p.errors.join("; ")}\n`);
	}

	if (opts.mode === "list") {
		for (const k of knownNames(registry)) {
			const s = registry[k];
			process.stdout.write(`${k.padEnd(10)} ${String(s.kind).padEnd(6)} ${s.label}\n`);
		}
		return 0;
	}

	const wanted = opts.harness.includes("all") ? knownNames(registry) : opts.harness;
	const unknown = wanted.filter((w) => !registry[w]);
	if (unknown.length) {
		process.stderr.write(
			`\nkid-explorer: no harness named ${unknown.map((u) => `"${u}"`).join(", ")}.\n` +
			`  Known: ${knownNames(registry).join(", ")}\n` +
			`  To add one without patching this project, drop a file at\n` +
			`      adapters/harnesses/<name>.harness.json\n` +
			`  See adapters/harnesses/README.md for the contract, or pass the\n` +
			`  fields on the command line to build it once:\n` +
			`      --kind rules --rules-dir .<tool>/rules --rules-ext mdc \\\n` +
			`      --context-file AGENTS.md --harness <name>\n\n`,
		);
		return 4;
	}

	const outRoot = opts.out;
	if (opts.mode === "verify") {
		let bad = 0;
		for (const k of wanted) {
			const ps = verifyOne(k, registry[k], outRoot, opts.inPlace, opts.scope);
			if (ps.length) { bad++; process.stdout.write(`  ✗ ${k}\n`); ps.forEach((p) => process.stdout.write(`      ${p}\n`)); }
			else process.stdout.write(`  ✓ ${k}\n`);
		}
		return bad ? 1 : 0;
	}

	process.stdout.write(`kid-explorer · building ${wanted.length} adapter(s) → ${outRoot} (${opts.scope})\n`);
	for (const k of wanted) {
		const spec = { ...registry[k], ...opts.overrides };
		process.stdout.write(`  ${k}: ${spec.label} [${spec.kind}]\n`);
		buildOne(k, spec, outRoot, opts);
	}
	process.stdout.write(`\n  ${written.length} file(s) ${opts.dryRun ? "planned" : "written"}\n`);
	return 0;
}

try {
	process.exitCode = main();
} catch (e) {
	process.stderr.write(`kid-explorer build failed: ${e.message}\n`);
	process.exitCode = 1;
}
