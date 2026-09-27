#!/usr/bin/env node
// Ask the registry a question, in a form bash can consume.
//
//   registry.query.mjs keys                  → one harness name per line
//   registry.query.mjs spec <key>            → the spec as JSON
//   registry.query.mjs field <key> <field>   → one field, raw
//   registry.query.mjs clauses core|package|rail
//   registry.query.mjs never                 → the never-grant list, one per line
//
// The suite reads its expectations through here rather than restating them, so
// that a new host is covered the moment it is added and the test cannot drift
// into checking an out-of-date copy of the table.

import { loadRegistry, knownNames } from "../../adapters/registry.mjs";
import { NEVER_GRANT, MUST_SURVIVE, CORE_IN_SKILL, RAIL_MUST_HOLD } from "../../adapters/harnesses.mjs";

const [mode, ...rest] = process.argv.slice(2);

function out(text) { process.stdout.write(text + "\n"); }

try {
	switch (mode) {
		case "keys":
			for (const k of knownNames(loadRegistry().registry)) out(k);
			break;
		case "spec":
			out(JSON.stringify(loadRegistry().registry[rest[0]] ?? null));
			break;
		case "field": {
			const spec = loadRegistry().registry[rest[0]];
			if (!spec) { process.stderr.write(`no harness ${rest[0]}\n`); process.exitCode = 2; break; }
			const v = spec[rest[1]];
			out(v === undefined || v === null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v)));
			break;
		}
		case "clauses":
			for (const c of rest[0] === "core" ? CORE_IN_SKILL : rest[0] === "rail" ? RAIL_MUST_HOLD : MUST_SURVIVE) out(c);
			break;
		case "never":
			for (const t of NEVER_GRANT) out(t);
			break;
		default:
			process.stderr.write(`unknown query: ${mode ?? "(none)"}\n`);
			process.exitCode = 2;
	}
} catch (e) {
	process.stderr.write(`registry query failed: ${e.message}\n`);
	process.exitCode = 1;
}
