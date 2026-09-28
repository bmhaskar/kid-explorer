// Writes the pre-fix shape of the frontmatter, for the negative control.
//
// This was a python heredoc until the container said so: the test image carries
// node, which the suite already requires, and not python, which it does not.
// A check that depends on a tool the suite does not require is a check that
// passes on the machine that happens to have the tool and fails on the one that
// does not, which is the wrong way round for every kind of dependency.
//
// The shape written is the one that shipped and broke the child's install: two
// values quoted away, so that each carries a colon and a space and is therefore
// read by yaml as a mapping nested in a mapping. Nothing here invents a fault;
// it removes a repair.
import { readFileSync, writeFileSync } from "node:fs";

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
	process.stderr.write("usage: make-broken-frontmatter.mjs <from> <to>\n");
	process.exitCode = 2;
} else {
	const lines = readFileSync(src, "utf8").split("\n");
	let removed = 0;
	const fixed = lines.map((l) => {
		if (l.startsWith("description: '")) { removed++; return "description: " + l.slice("description: '".length, -1); }
		if (l.startsWith("  audience: '")) { removed++; return "  audience: " + l.slice("  audience: '".length, -1); }
		return l;
	});
	if (removed !== 2) {
		process.stderr.write(`expected to unquote two values, unquoted ${removed}; the frontmatter has changed shape and the control is no longer the fault that shipped\n`);
		process.exitCode = 1;
	} else {
		writeFileSync(dst, fixed.join("\n"));
		process.stdout.write("the negative control was written, in the shape that shipped\n");
	}
}
