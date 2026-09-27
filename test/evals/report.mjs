// Print an evaluation report as a table, read from the JSON the run wrote.
import { readdirSync, readFileSync } from "node:fs";

const dir = process.argv[2] ?? "test/evals/results";
const pick = process.argv[3];
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
if (!files.length) { process.stderr.write(`no reports in ${dir}\n`); process.exitCode = 1; }
const j = JSON.parse(readFileSync(`${dir}/${pick ?? files.at(-1)}`, "utf8"));

const arms = j.arms ?? ["none", "rail", "body"];
const tally = Object.fromEntries(arms.map((a) => [a, 0]));
const rows = [];

for (const r of j.results) {
	const cell = {};
	for (const a of arms) {
		const v = r.arms?.[a];
		if (!v) { cell[a] = "—"; continue; }
		const measured = v.measured ?? v.samples;
		// a probe nothing was measured on is shown as such rather than as nought out
		// of ten, because the two look the same in a table and mean different things
		cell[a] = measured === 0 ? "no data" : `${v.passed}/${measured}`;
		if (measured > 0 && v.passed === measured) tally[a]++;
	}
	rows.push([r.id, r.group ?? "", ...arms.map((a) => cell[a]), r.nondiscriminating ? "passes with no policy: not testing the lens" : ""]);
}

const w = [26, 10, ...arms.map(() => 7), 34];
const line = "─".repeat(w[0] + w[1] + w.slice(2).reduce((a, b) => a + b, 0) + 3 + arms.length);
process.stdout.write(`\n  ${j.provider}/${j.model} · ${j.probes} probes · ${j.samples} sample(s) each · ${String(j.generated).slice(0, 10)}\n`);
process.stdout.write(`  ${line}\n`);
process.stdout.write(`  ${"probe".padEnd(w[0])}${"group".padEnd(w[1])}${arms.map((a) => a.padEnd(7)).join("")}note\n`);
for (const r of rows) {
	const cells = r.slice(0, 2 + arms.length);
	process.stdout.write(`  ${cells.map((c, i) => String(c).padEnd(w[i])).join("")}${r.at(-1)}\n`);
}
process.stdout.write(`  ${line}\n`);
process.stdout.write(`  probes passing every sample   ${arms.map((a) => `${a} ${tally[a]}/${j.probes}`).join("   ")}\n`);
process.stdout.write(`  probes that actually test the lens   ${j.discriminatingCount}/${j.probes}\n`);
if (j.nondiscriminating?.length) {
	process.stdout.write(`  not testing the lens: ${j.nondiscriminating.join(", ")}\n`);
}
process.stdout.write("\n");
