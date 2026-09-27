// The report must not be able to print a compliant reply beside the failures of
// some other reply, which is exactly what it did before this check existed.
//
// The runner kept the first reply that came back and, separately, the reasons
// the first failing sample failed. Those are different samples. So a report
// could print a reply that obeyed every rule above a list of rules that reply
// had not broken, and a reader would draw a conclusion from two things that
// never belonged together. I only found it by running the judge over the
// printed reply and watching it pass while the printed verdict said it had
// failed.
//
// So the claim is made testable: whatever reply a report shows, the judge run
// over that reply must agree with the verdict printed beside it.
import { readdirSync, readFileSync } from "node:fs";
import { judge } from "./judge.mjs";
import { PROBES, SANCTIONED } from "./probes.mjs";

const byId = Object.fromEntries(PROBES.map((p) => [p.id, p]));

const dir = process.argv[2] ?? new URL("./results", import.meta.url).pathname;
let files = [];
try { files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort(); } catch { /* no reports yet */ }

if (!files.length) {
	process.stdout.write("  (no report on disk yet, so there is nothing to check)\n");
	process.exitCode = 0;
}

const j = JSON.parse(readFileSync(`${dir}/${files.at(-1)}`, "utf8"));
let checked = 0, disagreed = 0;

for (const r of j.results ?? []) {
	for (const [arm, v] of Object.entries(r.arms ?? {})) {
		const probe = byId[r.id];
		if (!probe) continue;
		if (typeof v.reply !== "string" || !v.reply || (v.measured ?? 0) === 0) continue;
		// a reply that never arrived is not a reply, and must not be handed to the
		// judge as though it were one. The placeholder the runner stores for it
		// begins with the words "no reply", and a placeholder read as content is
		// precisely the confusion this whole file exists to catch — the judge would
		// find the text empty of everything the policy asks for and report a safety
		// failure for a request that never left the machine.
		if (/^\s*\(no reply:/i.test(v.reply)) continue;
		const fresh = judge(probe, v.reply, SANCTIONED);
		const recorded = v.fails ?? [];
		checked++;
		// an empty list of failures must mean the shown reply passes, and a non-empty
		// list must mean it does not; if they do not agree the two came from different
		// samples and the report is showing one thing while claiming another
		const agrees = fresh.length === 0 ? recorded.length === 0 : recorded.length > 0;
		if (agrees) continue;
		disagreed++;
		process.stdout.write(`  FAIL  ${r.id}/${arm}: the reply shown does not match the verdict shown\n`);
		process.stdout.write(`        re-judging the reply printed gives: ${fresh.join(" | ") || "(it passes)"}`.slice(0, 180) + "\n");
		process.stdout.write(`        the report claims:                  ${recorded.join(" | ") || "(nothing)"}`.slice(0, 180) + "\n");
	}
}

process.stdout.write(disagreed
	? `  ${disagreed} of ${checked} shown replies do not match their own verdicts — the report is mixing samples\n`
	: `  all ${checked} shown replies match their own verdicts\n`);
process.exitCode = disagreed ? 1 : 0;
