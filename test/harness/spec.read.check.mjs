// Reads a harness spec the way the registry reads one, and says whether it is
// readable.
//
// This was an inline `node -e` one-liner, and it was the single reason the
// node 22.6 job had ever failed: `import` at the top of a `-e` script is a
// static import, and a static import is refused outside a module, so the probe
// died with a syntax error before it read anything. The file on disk was
// perfectly good. The checker was broken and reported the file.
//
// A `-e` script is a CommonJS script unless something says otherwise, and what
// says otherwise changed between node's releases, which is why it worked at
// home and failed in CI. Dynamic import is a call rather than a statement, so
// it is legal in either kind of script and in either release. That is the form
// used here, and it is the form the suite's own capability probe already used,
// for exactly this reason, three commits before.
//
// The comment-stripping is the registry's own, copied rather than
// reimplemented-by-approximation: a checker that reads a file differently from
// the thing that consumes it will disagree with it, and the disagreement will be
// attributed to the file.
import { readFileSync } from "node:fs";

const file = process.env.KID_SPEC_FILE;
if (!file) {
	process.stderr.write("usage: KID_SPEC_FILE=<path> node spec.read.check.mjs\n");
	process.exitCode = 2;
} else {
	try {
		const text = readFileSync(file, "utf8");
		// the registry strips whole-line // comments so a shared file can be
		// annotated; without this a commented fixture is reported as broken
		const stripped = text.replace(/^[ \t]*\/\/.*$/gm, "");
		const spec = JSON.parse(stripped);
		if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
			process.stderr.write("not an object: a harness spec has to be a mapping\n");
			process.exitCode = 1;
		}
	} catch (e) {
		process.stderr.write(`not readable as a harness spec: ${e.message}\n`);
		process.exitCode = 1;
	}
}
