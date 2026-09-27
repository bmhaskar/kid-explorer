// Quotes every frontmatter scalar that carries a ": ".
//
// YAML reads `key: value: more` as a mapping whose value is itself a mapping,
// and pi's loader refuses that outright — "Nested mappings are not allowed in
// compact mappings". The description in this skill ends with "... psychologically
// safe: he cannot be in trouble, there are no wrong answers ...", and that colon
// is the whole of the reason the skill did not load on the child's machine.
//
// The quoting follows the yaml rule that an apostrophe inside a single-quoted
// scalar is written as two of them, so the words are left exactly as they were
// written. Nothing here edits meaning, which matters: these strings are the
// policy, and a pass that reworded them to satisfy a parser would be a pass that
// silently changed what the child is told.
import { readFileSync, writeFileSync } from "node:fs";

const p = process.argv[2] ?? "SKILL.md";
const lines = readFileSync(p, "utf8").split("\n");
const end = lines.indexOf("---", 1);
if (end < 0) { process.stderr.write("no frontmatter in " + p + "\n"); process.exitCode = 1; }

const A = "'";
let fixed = 0;
for (let i = 1; i < end; i++) {
	const m = lines[i].match(/^(\s*)([A-Za-z0-9_-]+):(\s+)(.*)$/);
	if (!m) continue;
	const [, ind, key, sp, val] = m;
	if (/^(["'])\1$/.test(val.trim())) continue;            // already quoted
	if (!val.includes(": ")) continue;                       // cannot be read as a mapping
	lines[i] = ind + key + ":" + sp + A + val.replaceAll(A, A + A) + A;
	fixed++;
	process.stdout.write("  quoted line " + (i + 1) + "  '" + key.trim() + "'\n");
}
writeFileSync(p, lines.join("\n"));
process.stdout.write("\n  " + fixed + " values quoted; the words inside them are untouched\n");
