// Fault injection for the documentation checker.
//
// A checker that cannot fail is worth less than no checker, because it is
// believed. Every claim the docs suite makes is therefore put to a case in
// which it must be seen to be false.
//
// Two things are asserted before any verdict is recorded, and both were learned
// the hard way. The first attempt at this file reported that the checker was
// decorative, and that report was false: the faults had not been planted,
// because the needles were text I had invented rather than text I had read out
// of the README. So each needle is checked to exist before it is replaced, and
// each replacement is read back from disk rather than trusted from what we
// meant to write. A fault that was never planted detects nothing, and a suite
// that reports on it tells you about your own test rather than about your code.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const SRC = "README.md";
const BACK = "/tmp/README.faultcheck.backup";
copyFileSync(SRC, BACK);

const results = [];
let undetected = 0;

function restore() { copyFileSync(BACK, SRC); }

function plant(find, replace) {
	const s = readFileSync(SRC, "utf8");
	if (!s.includes(find)) throw new Error(`the needle is not in the README: ${JSON.stringify(find).slice(0, 70)}`);
	const after = s.replace(find, () => replace);
	writeFileSync(SRC, after);
	// read it back from disk: what we meant to write is not evidence that we wrote it
	if (!readFileSync(SRC, "utf8").includes(replace)) throw new Error("the fault was not on disk after writing");
}

function verdict() {
	try {
		const out = execSync("node test/harness/docs.claims.check.mjs", { encoding: "utf8" });
		return { refused: false, out };
	} catch (e) {
		return { refused: true, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
	}
}

function test(name, find, replace, expectNamed) {
	try {
		plant(find, replace);
	} catch (e) {
		// an unplanted fault is a fault in this file, and saying so is the whole
		// point: reporting it as "the checker missed it" would convict an innocent
		// checker of a crime the harness committed
		results.push(["HARNESS", name, e.message]);
		undetected++;
		restore();
		return;
	}
	const v = verdict();
	restore();
	if (!v.refused) {
		results.push(["MISSED", name, "the checker passed a document it should have refused"]);
		undetected++;
	} else if (expectNamed && !v.out.includes(expectNamed)) {
		results.push(["WRONG ", name, `refused, but not for the stated reason; looked for ${JSON.stringify(expectNamed)}`]);
		undetected++;
	} else {
		results.push(["caught", name, "refused, for the reason on the plaque"]);
	}
}

// each needle below was read out of the README before it was used
test(
	"a make target that does not exist",
	"make evals              # asks the model the probes",
	"make evals              # asks the model the probes\nmake frobnicate-the-widget",
	"frobnicate-the-widget",
);
test(
	"a suite listed that is not on disk",
	"| `90-docs` |",
	"| `90-docs` |\n| `99-phantom-suite` |",
	null,
);
test(
	"a flag the installer does not accept",
	"| `--list-harnesses` |",
	"| `--frobnicate-the-widget` | A flag that was never implemented. |\n| `--list-harnesses` |",
	null,
);
test(
	"a path in the layout tree that leads nowhere",
	"test/evals.sh",
	"test/evals.sh\n│   ├── phantom-file-that-was-never-written.sh",
	null,
);

process.stdout.write("\n  the documentation checker, put to its own faults\n\n");
for (const [v, name, note] of results) {
	process.stdout.write(`  ${v === "caught" ? "ok    " : "FAIL  "} ${name.padEnd(38)} ${v === "caught" ? "" : `[${v}] `}${note}\n`);
}
process.stdout.write(`\n  ${undetected
	? `${undetected} of ${results.length} did not go as they should — read the tags before believing the checker`
	: `all ${results.length} faults were caught, each for its stated reason`}\n`);

restore();
process.exitCode = undetected ? 1 : 0;
