// The scoping is the substance of the flag check, so it gets its own faults.
//
// A checker that pools the two programs' flags would pass a README that tells a
// parent to type `--project-dir` at the installer, which answers "unknown
// option", because `--project-dir` is real — on the other program. That is the
// exact failure this is for, and it is invisible to any test that only plants a
// flag that exists nowhere.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SRC = "README.md";
const BACK = "/tmp/README.scoping.backup";
copyFileSync(SRC, BACK);

const results = [];
let bad = 0;

function plant(find, replace) {
	const s = readFileSync(SRC, "utf8");
	if (!s.includes(find)) throw new Error(`the needle is not in the README: ${JSON.stringify(find).slice(0, 70)}`);
	writeFileSync(SRC, s.replace(find, () => replace));
	if (!readFileSync(SRC, "utf8").includes(replace)) throw new Error("the fault did not land on disk");
}
function restore() { copyFileSync(BACK, SRC); }
function refused() {
	try { execSync("node test/harness/docs.claims.check.mjs", { encoding: "utf8" }); return { no: false, out: "" }; }
	catch (e) { return { no: true, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}
function test(name, find, replace, mustSay) {
	try { plant(find, replace); }
	catch (e) { results.push(["HARNESS", name, e.message]); bad++; restore(); return; }
	const r = refused();
	restore();
	if (!r.no) { results.push(["MISSED", name, "accepted a document it must refuse"]); bad++; }
	else if (mustSay && !r.out.includes(mustSay)) { results.push(["WRONG ", name, `refused, not for the stated reason`]); bad++; }
	else results.push(["caught", name, ""]);
}

// a flag that exists on neither program, in each table
test(
	"a flag invented for the installer's table",
	"| `--list-harnesses` |",
	"| `--frobnicate-the-widget` | Not a flag anywhere. |\n| `--list-harnesses` |",
	null,
);
test(
	"a flag invented for the builder's table",
	"| `--rules-name NAME` |",
	"| `--frobnicate-the-widget` | Not a flag anywhere. |\n| `--rules-name NAME` |",
	null,
);

// and the cross-table case, which is the one a pooled checker would wave through:
// --project-dir is a genuine flag of the builder, planted into the installer's
// table, where it is a lie a parent would act on
test(
	"a real builder flag, documented under the installer",
	"| `--list-harnesses` |",
	"| `--project-dir DIR` | Where the project copy goes. |\n| `--list-harnesses` |",
	"--project-dir",
);

// and the converse, which is the half that catches a flag renamed away: the
// program accepts it and no reader is ever told
test(
	"a real installer flag, documented nowhere",
	"| `--offline` |",
	"| `--frobnigate-only-internal` |",
	null,
);

process.stdout.write("\n  the flag check, put to faults that a pooled checker would pass\n\n");
for (const [v, name, note] of results) {
	process.stdout.write(`  ${v === "caught" ? "ok    " : "FAIL  "} ${name.padEnd(46)} ${note}\n`);
}
process.stdout.write(`\n  ${bad ? `${bad} of ${results.length} did not go as they should` : `all ${results.length} caught — the scoping is doing real work`}\n`);
restore();
process.exitCode = bad ? 1 : 0;
