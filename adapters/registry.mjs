// The harness registry: built-ins plus whatever the family drops in.
//
// Resolution order, later wins, so a parent can correct a path a host changed
// in a new release without patching this project:
//
//   1. REGISTRY                       built-in, in this repository
//   2. adapters/harnesses/*.harness.json      project-local, shared in git
//   3. $KID_EXPLORER_HARNESS_DIR/*.harness.json
//   4. ~/.config/kid-explorer/harnesses/*.harness.json
//
// Nothing is trusted because it came from a file. Every entry, built-in or
// hand-written, is validated against the same rules before it is built. The
// registry is open; the safety invariants are not.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import {
	REGISTRY,
	NEVER_GRANT,
	REQUIRED_FIELDS,
	REQUIRED_BY_KIND,
	KINDS,
} from "./harnesses.mjs";

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FILE_SUFFIX = ".harness.json";

// Tools that must never appear in an allowlist, lower-cased for comparison so
// that Bash, bash, and BASH are all caught.
const NEVER_LOWER = new Set(NEVER_GRANT.map((t) => t.toLowerCase()));

function searchDirs() {
	const dirs = [];
	dirs.push(join(import.meta.dirname, "harnesses"));
	if (process.env.KID_EXPLORER_HARNESS_DIR) {
		for (const d of process.env.KID_EXPLORER_HARNESS_DIR.split(":")) {
			if (d.trim()) dirs.push(d.trim());
		}
	}
	try {
		dirs.push(join(homedir(), ".config", "kid-explorer", "harnesses"));
	} catch {
		// no home directory to look in; the built-ins still stand
	}
	return dirs;
}

function readUserEntries() {
	const found = [];
	for (const dir of searchDirs()) {
		if (!existsSync(dir)) continue;
		let names;
		try {
			names = readdirSync(dir).filter((n) => n.endsWith(FILE_SUFFIX)).sort();
		} catch {
			continue;
		}
		for (const n of names) {
			const path = join(dir, n);
			const key = n.slice(0, -FILE_SUFFIX.length);
			let text;
			try {
				text = readFileSync(path, "utf8");
			} catch (e) {
				found.push({ key, path, errors: [`cannot read: ${e.message}`] });
				continue;
			}
			let spec;
			try {
				// strip // line comments so a shared file can be annotated
				spec = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
			} catch (e) {
				found.push({ key, path, errors: [`not valid JSON: ${e.message}`] });
				continue;
			}
			found.push({ key, path, spec });
		}
	}
	return found;
}

// The rules. Deliberately the same for built-ins and for hand-written entries:
// an open registry is a footgun unless the invariants are checked on every
// entry, whoever wrote it.
export function validate(key, spec) {
	const errors = [];
	const warn = [];

	if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
		return { errors: ["the spec must be a JSON object"], warnings: [] };
	}
	if (!NAME_RE.test(key)) {
		errors.push(`key "${key}" is not a harness name (lowercase letters, digits, single hyphens)`);
	}
	for (const f of REQUIRED_FIELDS) {
		if (spec[f] === undefined || spec[f] === null || spec[f] === "") {
			errors.push(`missing required field "${f}"`);
		}
	}
	if (!KINDS.includes(spec.kind)) {
		errors.push(`kind "${spec.kind}" is unknown (use one of: ${KINDS.join(", ")})`);
	} else {
		for (const f of REQUIRED_BY_KIND[spec.kind]) {
			const v = spec[f];
			if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0 && f !== "allowedTools")) {
				errors.push(`kind "${spec.kind}" requires a non-empty "${f}"`);
			}
		}
	}

	// The safety invariants. These are not configurable, per host or at all.
	for (const [field, list] of [["allowedTools", spec.allowedTools], ["deniedTools", spec.deniedTools]]) {
		if (list === undefined) continue;
		if (!Array.isArray(list)) { errors.push(`${field} must be an array of tool names`); continue; }
		for (const t of list) {
			if (typeof t !== "string" || !t.trim()) { errors.push(`${field} contains a blank entry`); continue; }
			if (field === "allowedTools" && NEVER_LOWER.has(t.toLowerCase())) {
				errors.push(`allowedTools may never grant "${t}" — a child-facing skill gets no shell, no file writes, no patches`);
			}
		}
	}

	// A skill host must say where the skill goes; a rules host must say where the
	// rules go, and with which extension, because some hosts ignore the wrong one.
	if (spec.projectDir !== undefined) {
		if (typeof spec.projectDir !== "string" || !spec.projectDir.trim()) {
			errors.push("projectDir must be a non-empty relative path");
		} else if (spec.projectDir.startsWith("/") || spec.projectDir.includes("..")) {
			errors.push(`projectDir "${spec.projectDir}" must be relative and must not contain ..`);
		}
	}
	if (spec.homeDir !== undefined && typeof spec.homeDir === "string") {
		if (spec.homeDir.startsWith("/") || spec.homeDir.includes("..")) {
			errors.push(`homeDir "${spec.homeDir}" must be relative to the home directory and must not contain ..`);
		}
	}
	if (spec.rulesDir !== undefined) {
		if (typeof spec.rulesDir !== "string" || !spec.rulesDir.trim()) {
			errors.push("rulesDir must be a non-empty relative path");
		} else if (spec.rulesDir.startsWith("/") || spec.rulesDir.includes("..")) {
			errors.push(`rulesDir "${spec.rulesDir}" must be relative and must not contain ..`);
		}
	}
	if (spec.rulesExt !== undefined && !/^[a-z0-9]+$/.test(String(spec.rulesExt))) {
		errors.push(`rulesExt "${spec.rulesExt}" must be a bare extension with no dot`);
	}
	if (spec.rulesFrontmatter !== undefined) {
		if (typeof spec.rulesFrontmatter !== "object" || spec.rulesFrontmatter === null || Array.isArray(spec.rulesFrontmatter)) {
			errors.push("rulesFrontmatter must be an object of scalar values");
		} else {
			for (const [k, v] of Object.entries(spec.rulesFrontmatter)) {
				// keys are the host's own vocabulary (Cursor names one alwaysApply), so
				// casing is not checked; what matters is that a key cannot break out of
				// the mapping, which the scalar check below already guarantees
				if (!/^[A-Za-z0-9_-]+$/.test(k)) errors.push(`rulesFrontmatter key "${k}" is not a plain key`);
				if (v !== null && typeof v !== "string" && typeof v !== "boolean" && typeof v !== "number") {
					errors.push(`rulesFrontmatter value for "${k}" must be a scalar`);
				}
			}
			if (!String(spec.rulesFrontmatter.description ?? "").trim()) {
				warn.push("rulesFrontmatter has no description, so the host may never surface the rule");
			}
		}
	}
	if (spec.contextFile !== undefined && spec.contextFile !== null) {
		if (typeof spec.contextFile !== "string" || !/^[A-Z0-9._-]+\.md$/.test(spec.contextFile)) {
			errors.push(`contextFile "${spec.contextFile}" must be a bare file name ending in .md`);
		}
	}
	if (spec.inlineBody !== undefined && typeof spec.inlineBody !== "boolean") {
		errors.push("inlineBody must be true or false");
	}
	if (spec.extends !== undefined && typeof spec.extends !== "string") {
		errors.push("extends must be a harness name to inherit from");
	}
	if (!spec.source) {
		warn.push("no source recorded; a wrong path fails quietly, so say where the facts came from");
	}

	return { errors, warnings: warn };
}

// The merged registry: built-ins, then user files over them, each validated.
export function loadRegistry({ builtins = REGISTRY, strict = true } = {}) {
	const merged = {};
	const problems = [];

	for (const [key, spec] of Object.entries(builtins)) {
		const v = validate(key, spec);
		if (v.errors.length) problems.push({ key, path: "built-in", ...v });
		merged[key] = { ...spec };
	}

	// inheritance: an entry may extend another rather than repeat it
	const user = readUserEntries();
	for (const { key, path, spec, errors } of user) {
		if (errors) {
			problems.push({ key, path, errors, warnings: [] });
			continue;
		}
		const base = spec.extends ? merged[spec.extends] : undefined;
		if (spec.extends && !base) {
			problems.push({ key, path, errors: [`extends "${spec.extends}" which is not a known harness`], warnings: [] });
			continue;
		}
		const spec2 = { ...base, ...spec };
		delete spec2.extends;
		const v = validate(key, spec2);
		if (v.errors.length) {
			problems.push({ key, path, ...v });
			continue;
		}
		merged[key] = spec2;
	}

	if (strict && problems.length) {
		const lines = problems.flatMap((p) => [
			`  ${p.key}  (${p.path})`,
			...p.errors.map((e) => `      ✗ ${e}`),
			...p.warnings.map((w) => `      ! ${w}`),
		]);
		throw new Error(`harness registry rejected:\n${lines.join("\n")}`);
	}
	return { registry: merged, problems };
}

export function knownNames(registry = REGISTRY) {
	return Object.keys(registry).sort();
}

export { NEVER_GRANT, REQUIRED_BY_KIND, KINDS };
