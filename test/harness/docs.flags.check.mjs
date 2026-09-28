// 6. every flag the README documents is one the program named beside it accepts.
//
// This check is claimed in the suite header and was not implemented: the file
// said it holds down "the flags, the make targets, the files drawn in the layout
// tree, the suites", and it held down three of those four. The gap was found by
// fault injection rather than by reading, which is the only way such things are
// found — a check that is described and not written looks exactly like a check
// that is written, right up until the moment it matters.
//
// The scoping matters as much as the check. The README has two flag tables, one
// for the installer and one for the adapter builder, and `--project` on the
// installer is a different flag from `--project-dir` on the builder. A checker
// that pooled them would pass a document that tells a parent to type something
// the program will answer "unknown option" to, which is the precise failure this
// is for: the flag that was renamed away, and the parent who typed it and got
// nothing.
//
// So each table is read with the program it belongs to, and a flag is accepted
// only if that one program's argument parser has an arm for it.
import { readFileSync, existsSync } from "node:fs";

export function checkFlags(readme, say, root = ".") {
	// the arms of each program's argument parser, read from the source rather than
	// from a list kept somewhere else, which would be a second truth to go stale
	const armsIn = (file) => {
		if (!existsSync(file)) return null;
		const src = readFileSync(file, "utf8");
		const found = new Set();
		// shell: case arms, including grouped ones like --skill|--no-ext
		for (const m of src.matchAll(/(?:^|\n)\s*((?:--[a-z][a-z0-9-]*\|?)+)\)/g)) {
			for (const f of m[1].split("|")) found.add(f);
		}
		// node: string comparisons against a flag, in either order
		for (const m of src.matchAll(/"(--[a-z][a-z0-9-]*)"/g)) found.add(m[1]);
		for (const m of src.matchAll(/case\s+"(--[a-z][a-z0-9-]*)"/g)) found.add(m[1]);
		return found;
	};

	const installer = armsIn(`${root}/install.sh`);
	const builder = armsIn(`${root}/adapters/build.mjs`);

	say(installer !== null, `the installer's own flag list was read from install.sh (${installer ? installer.size : 0} arms)`);
	say(builder !== null, `the adapter builder's flag list was read from adapters/build.mjs (${builder ? builder.size : 0} arms)`);
	if (installer === null || builder === null) return;

	// which table a row sits in decides which program it is a claim about.
	//
	// The scan walks every heading at every level and inherits the owner from the
	// most recent one that names a program, because the builder's table is not
	// under a heading that says "builder": it is under "For another agent", which
	// is what a reader would look for and is nothing like what a matcher would.
	// Matching headings by exact name silently scanned one of the two programs and
	// reported that as having scanned both, which is the shape of a check that
	// passes because it looked at less than it says it looked at.
	const headings = [...readme.matchAll(/^(#{2,5}) ([^\n]+)$/gm)].map((m) => ({ level: m[1].length, text: m[2] }));
	const claim = [];
	const ownerAt = (offset) => {
		let owner = null;
		let seen = "";
		for (const h of headings) {
			if (readme.indexOf(`## ${h.text}`) > offset && offset < readme.length) break;
			const h_ = h.text.toLowerCase();
			if (/installer|install\.sh/.test(h_)) { owner = ["install.sh", installer]; seen = h.text; }
			else if (/for another agent|unknown host|adapter builder|build\.mjs|add a host/.test(h_)) { owner = ["adapters/build.mjs", builder]; seen = h.text; }
		}
		return owner ? { ...owner, heading: seen } : null;
	};

	// walk the document in order, so that a table inherits the program named by
	// the heading above it rather than the one nearest its own text
	let current = null;
	for (const line of readme.split("\n")) {
		const hm = line.match(/^(#{2,5}) ([^\n]+)$/);
		if (hm) {
			const h_ = hm[2].toLowerCase();
			if (/installer|install\.sh/.test(h_)) current = { of: "install.sh", accepted: installer, heading: hm[2] };
			else if (/for another agent|unknown host|adapter builder|build\.mjs|add a host/.test(h_)) current = { of: "adapters/build.mjs", accepted: builder, heading: hm[2] };
			continue;
		}
		if (!current) continue;
		// only table rows, so that a stray backticked flag in prose is not read as a
		// claim about an interface
		if (!/^\|\s*`--/.test(line)) continue;
		for (const m of line.matchAll(/`(--[a-z][a-z0-9-]+)(?:`[ ,]+`(--[a-z][a-z0-9-]+))?/g)) {
			for (const f of [m[1], m[2]].filter(Boolean)) claim.push({ flag: f, ...current });
		}
	}

	const bogus = claim.filter((c) => !c.accepted.has(c.flag) && c.flag !== "--help" && c.flag !== "-h");
	say(
		!bogus.length,
		`every documented flag is accepted by the program it is documented under`
		+ `${bogus.length ? `: ${bogus.map((b) => `${b.flag} (claimed under "${b.heading}" for ${b.of})`).join(", ")}` : ""}`
		+ ` (${claim.length} documented, across ${new Set(claim.map((c) => c.of)).size} programs)`,
	);

	// and the converse, which is the half that catches a flag that was renamed
	// away: a program may accept a hundred flags and the README may document two,
	// and the reader will never learn of the other ninety-eight
	const documented = new Set(claim.map((c) => c.flag));
	const undocumentedInstaller = [...installer].filter((f) => !documented.has(f) && !["-h", "--"].includes(f));
	say(
		!undocumentedInstaller.length,
		`the installer documents every flag it accepts${undocumentedInstaller.length ? `: missing ${undocumentedInstaller.join(", ")}` : ""}`,
	);

	return { claim, installer, builder };
}
