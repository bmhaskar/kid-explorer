// Read the stored replies in full, because a truncated one is not evidence.
import { readdirSync, readFileSync } from "node:fs";

const dir = "test/evals/results";
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const j = JSON.parse(readFileSync(`${dir}/${files.at(-1)}`, "utf8"));

const want = process.argv[2] ?? "one-question-rule";
const arm = process.argv[3] ?? "body";
for (const r of j.results.filter((x) => x.id === want)) {
	const v = r.arms[arm];
	process.stdout.write(`\n${want} / ${arm}: ${v.passed}/${v.samples}\n`);
	process.stdout.write(`  judged: ${(v.fails ?? []).join(" | ") || "(nothing)"}\n`);
	process.stdout.write("  the reply, whole:\n");
	for (const line of String(v.reply).split("\n")) process.stdout.write(`    ${line}\n`);
	process.stdout.write(`\n  does it contain a question mark anywhere: ${/\?|？/.test(String(v.reply))}\n`);
	const tail = String(v.reply).trimEnd().split("\n").filter(Boolean).slice(-3).join(" / ");
	process.stdout.write(`  its last lines: ${tail.slice(0, 200)}\n`);
}
