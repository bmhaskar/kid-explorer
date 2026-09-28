// Fault injection for the documentation checker.
//
// A checker that cannot fail is worth less than no checker, because it is
// believed. Every claim this suite makes is therefore put to a case where it
// must be seen to be false, and the fault is asserted to have landed before the
// checker is consulted about it — the last attempt at this produced a confident
// verdict that the checker was vacuous, which was false, and the fault had not
// been written at all.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";

const SRC = "README.md";
const BACK = "/tmp/README.injected.backup";
copyFileSync(SRC, BACK);

let failures = 0;
const results = [];

function restore() { copyFileSync(BACK, SRC); }

function inject(find, replace) {
	const s = readFileSync(SRC, "utf8");
	if (!s.includes(find)) throw new Error(`the fault could not be planted: ${JSON.stringify(find).slice(0, 60)} is not in the README`);
	const after = s.replace(find, () => replace);
	if (!after.includes(replace)) throw new Error("the fault was planted and then not: it is not in the file afterwards");
	writeFileSync(SRC, after);
	// and not merely planted: read it back from disk, not from what we meant to write
	if (!readFileSync(SRC, "utf8").includes(replace)) throw new Error("the file on disk does not hold the fault");
}

function runChecker() {
	try {
		const out = execSync("node test/harness/docs.claims.check.mjs", { encoding: "utf8", cwd: process.cwd() });
		return { ok: true, out };
	} catch (e) {
		return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
	}
}

function must(name, find, replace, expectToBeNamed) {
	try {
		inject(find, replace);
	} catch (e) {
		results.push(["SKIP", name, e.message]);
		failures++;
		restore();
		return;
	}
	const r = runChecker();
	restore();
	if (r.ok) {
		results.push(["BAD ", name, "the checker passed a document it should have refused"]);
		failures++;
	} else if (expectToBeNamed && !r.out.includes(expectToBeNamed)) {
		results.push(["BAD ", name, `refused, but not for the reason claimed; looked for ${JSON.stringify(expectToBeNamed)}`]);
		failures++;
	} else {
		results.push(["good", name, "refused, for the reason on the plaque"]);
	}
}

// each of these is a claim the README makes, broken in a way a reader would act on
must(
	"a make target that does not exist",
	"make evals-judge",
	"make evals-judge\nmake frobnicate-the-widget",
	"frobnicate-the-widget",
);
must(
	"a suite that is not on disk",
	"| `90-docs` |",
	"| `90-docs` |\n| `99-phantom` |",
	null,
);
must(
	"a flag the installer does not accept",
	"  --harness NAME",
	"  --harness NAME\n  --frobnicate-the-widget",
	null,
);
must(
	"a path in the layout tree that leads nowhere",
	"test/evals.sh",
	"test/evals.sh\n│   ├── test/evals.sh\n│   │   └── phantom-file-that-was-never-written.sh",
	null,
);

process.stdout.write("\n  the documentation checker, put to its own faults\n\n");
for (const [verdict, name, note] of results) {
	process.stdout.write(`  ${verdict === "good" ? "ok  " : "FAIL"}  ${name.padEnd(38)} ${note}\n`);
}
process.stdout.write(`\n  ${failures ? `${failures} of ${results.length} faults went undetected — the checker is decorative` : `all ${results.length} faults were detected, each for its stated reason`}\n`);

restore();
process.exitCode = failures ? 1 : 0;
