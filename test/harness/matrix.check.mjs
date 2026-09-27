// Cross-check the README's host matrix against the registry that generates it.
// The matrix is hand-typed prose about machine-readable data, which is exactly
// the pairing that goes stale quietly.
import { readFileSync } from "node:fs";
import { loadRegistry } from "../../adapters/registry.mjs";

const readme = readFileSync("README.md", "utf8");

// Only the section that makes claims about hosts. Sweeping the whole file picks
// up the feature table, whose bolded rows are not host names.
const section = readme.split(/^## /m).find((b) => /^Which agents it runs on/.test(b)) ?? "";
const rows = [...section.matchAll(/^\|\s*\*\*([^*|]+)\*\*\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/gm)];

let bad = 0;
const say = (ok, msg) => { process.stdout.write(`  ${ok ? "ok  " : "FAIL"} ${msg}\n`); if (!ok) bad++; };
const clean = (s) => s.replace(/`/g, "").trim();

const registry = loadRegistry().registry;
const byLabel = new Map();
for (const [k, spec] of Object.entries(registry)) byLabel.set(spec.label.toLowerCase(), { key: k, spec });

const find = (label) => {
	const l = clean(label).toLowerCase();
	// the portable row is headed for a parent, not for the registry
	if (/anything else|portable|generic/i.test(l)) return { key: "generic", spec: registry.generic };
	if (byLabel.has(l)) return byLabel.get(l);
	for (const [name, hit] of byLabel) if (name.includes(l) || l.includes(name)) return hit;
	return null;
};

say(rows.length >= 8, `${rows.length} host rows are drawn in the matrix (expected at least 8)`);

for (const row of rows) {
	const [, labelRaw, shapeRaw, whereRaw, howRaw] = row;
	const label = clean(labelRaw);
	if (/anything else/i.test(label)) {
		// the generic row is a claim about the portable location, not about an entry
		const ok = /"\.agents\/skills/.test(whereRaw) || /\.agents\/skills/.test(clean(whereRaw));
		say(ok, `the portable row points at .agents/skills${ok ? "" : ", but says: " + clean(whereRaw)}`);
		continue;
	}
	const hit = find(label);
	if (!hit) { say(false, `no registry entry answers to "${label}"`); continue; }
	const { key, spec } = hit;
	const problems = [];

	const shape = clean(shapeRaw);
	const shapeOk = shape === spec.kind || (shape === "skills" && spec.kind === "skill");
	if (!shapeOk) problems.push(`shape column says "${shape}", the registry kind is "${spec.kind}"`);

	// One cell may name several ways to reach the same host. The registry writes
	// an alternative in brackets, the table writes it after "or", and neither of
	// those is a difference worth a red suite — so the primary command is compared
	// exactly and the alternatives are compared as a set.
	const splitCall = (text) => {
		const raw = String(text ?? "");
		const parenthetical = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
		const outside = raw.replace(/\([^)]*\)/g, "");
		const pieces = outside
			.split(/,\s*or\s+|\bor\s+(?=`|\/|\$|@)/i)
			.map((x) => clean(x).replace(/\.$/, ""))
			.filter(Boolean);
		const alternates = new Set();
		for (const p of pieces.slice(1)) alternates.add(p);
		for (const p of parenthetical) for (const q of p.split(/,|\s+or\s+/i)) {
			const t = clean(q).replace(/^(or|also)\s+/i, "").replace(/\.$/, "");
			if (t) alternates.add(t);
		}
		return { primary: pieces[0] ?? "", alternates };
	};
	const table = splitCall(howRaw);
	const truth = splitCall(spec.slashCommand);
	if (table.primary !== truth.primary) {
		problems.push(`invocation column says "${table.primary}", the registry says "${truth.primary}"`);
	}
	for (const alt of truth.alternates) {
		if (!alt) continue;
		if (!table.alternates.has(alt)) problems.push(`the registry also offers "${alt}" and the table does not mention it`);
	}

	const dirs = [spec.projectDir, spec.homeDir, spec.rulesDir].filter(Boolean);
	const cells = clean(whereRaw).split(/,/).map((x) => x.trim()).filter(Boolean);
	if (!cells.length) problems.push("the where column is empty");
	for (const cell of cells) {
		const bare = cell.replace(/^~\//, "").replace(/\/$/, "");
		const covered = dirs.some((d) => {
			const dd = d.replace(/\/$/, "");
			return bare === dd || bare.startsWith(dd + "/") || dd.startsWith(bare + "/") || dd.endsWith(bare);
		});
		if (!covered) problems.push(`the path "${cell}" is not a directory the registry knows for ${key} (${dirs.join(", ")})`);
	}

	const summary = `${key}: ${cells.length} path(s) and "${table.primary}" agree with the registry`;
	say(!problems.length, problems.length ? `${key}: ${problems.join("; ")}` : summary);
}

// every entry in the registry should appear in the matrix, or a host exists that
// a parent cannot read about
const listed = rows.map((r) => clean(r[1]).toLowerCase());
for (const [k, spec] of Object.entries(registry)) {
	const l = spec.label.toLowerCase();
	// the portable entry is headed for a parent rather than by its label, so the
	// reverse check has to know that "anything else" is where generic is written
	const alias = k === "generic" ? ["anything else", "portable", "generic"] : [l];
	const seen = listed.some((x) => alias.some((a) => x === a || x.includes(a) || a.includes(x)));
	say(seen, `the matrix mentions ${k} (${spec.label})`);
}

process.exitCode = bad ? 1 : 0;
