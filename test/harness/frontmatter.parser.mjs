// A frontmatter parser, and the reason the suite needed one.
//
// The frontmatter suite checked which keys were present, using a regular
// expression over the lines. It never asked whether the block was a document at
// all. So a skill whose frontmatter no loader will accept passed, and passed
// loudly, on every node in the matrix, while failing to load on the one machine
// it was installed on. The check was the shape of the thing rather than the
// thing, which is the particular kind of check that tells you nothing.
//
// The failure was this: the description ends "... psychologically safe: he cannot
// be in trouble, there are no wrong answers ...". YAML reads `key: value: more`
// as a mapping whose value is itself a mapping, and pi says so — "Nested
// mappings are not allowed in compact mappings at line 2, column 14". A regex
// that looks only for `^key:` cannot see that, because the line does begin with
// `description:` and does have a colon after it, exactly as a well-formed line
// would.
//
// This is not a yaml implementation. It parses the subset the skill spec allows,
// and it refuses anything outside it, which is the behaviour wanted: an
// artefact that a real loader might reject must be rejected here first.
export class FrontmatterError extends Error {
	constructor(message, line, column) {
		super(message);
		this.line = line;
		this.column = column;
	}
}

// the fields the spec defines as comma-separated, so that they are split here
// once rather than re-split by hand in every reader
export const LIST_FIELDS = new Set(["allowed-tools", "disallowed-tools"]);

// the six fields the agent-skills spec permits, and nothing else
export const SPEC_FIELDS = ["name", "description", "license", "compatibility", "metadata", "allowed-tools", "disallowed-tools"];

function stripComment(line) {
	// a "#" begins a comment only where it is outside a quoted scalar and is
	// preceded by a space or a tab, which is the yaml rule
	let inSingle = false, inDouble = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === "'" && !inDouble) inSingle = !inSingle;
		else if (c === '"' && !inSingle) inDouble = !inDouble;
		else if (c === "#" && !inSingle && !inDouble && (i === 0 || /[\s]/.test(line[i - 1]))) {
			return line.slice(0, i);
		}
	}
	return line;
}

// reads a quoted scalar, returning the raw text and whether it was quoted
function readScalar(raw) {
	const t = raw.trim();
	if (t.length < 2) return { text: t, quoted: false };
	const first = t[0], last = t.at(-1);
	if (first === "'" && last === "'") return { text: t.slice(1, -1).replaceAll("''", "'"), quoted: true };
	if (first === '"' && last === '"') return { text: t.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\"), quoted: true };
	return { text: t, quoted: false };
}

/**
 * Splits the frontmatter block off a markdown document.
 * Returns null when there is none, which is a different thing from an empty one.
 */
export function splitFrontmatter(text) {
	const lines = text.split("\n");
	if (lines[0]?.trim() !== "---") return null;
	const end = lines.indexOf("---", 1);
	if (end < 0) return null;
	return { body: lines.slice(1, end).join("\n"), firstLine: 2, lines: lines.slice(1, end) };
}

/**
 * Parses the frontmatter block. Throws FrontmatterError with a line and a
 * column, so that a failure points at the thing that failed rather than at the
 * file that contains it.
 */
export function parseFrontmatter(text) {
	const split = splitFrontmatter(text);
	if (!split) throw new FrontmatterError("the document opens with no '---' frontmatter block", 1, 1);
	const out = {};
	const stack = [{ indent: -1, map: out }];

	split.lines.forEach((rawLine, idx) => {
		const lineNo = idx + split.firstLine;
		const line = stripComment(rawLine);
		if (!line.trim()) return;
		if (/\t/.test(line.slice(0, line.length - line.trimStart().length))) {
			throw new FrontmatterError("a tab was used to indent", lineNo, 1);
		}
		const indent = line.length - line.trimStart().length;
		const body = line.trimStart();

		const parent = stack.findLast((f) => f.indent < indent) ?? stack.at(-1);
		if (indent !== parent.indent + 0 && parent.indent !== -1 && indent > parent.indent + 2) {
			throw new FrontmatterError("the indentation jumped by more than two spaces", lineNo, indent + 1);
		}
		if (body.startsWith("- ")) {
			if (!Array.isArray(parent.list)) throw new FrontmatterError("a list item appears where a mapping was open", lineNo, indent + 1);
			parent.list.push(readScalar(body.slice(2)).text);
			return;
		}

		const m = body.match(/^([^:\s]+):(?:\s+(.*))?$/);
		if (!m) throw new FrontmatterError("this line is neither a mapping nor a list item", lineNo, indent + 1);
		const key = m[1];
		const value = m[2] ?? "";

		// the check the whole of this file exists for. An unquoted scalar
		// containing ": " is a mapping nested inside a mapping, and no loader in
		// the spec's family will take it.
		const { text: scalar, quoted } = readScalar(value);
		if (!quoted && value !== "") {
			const at = findColonSpace(value);
			if (at >= 0) {
				throw new FrontmatterError(
					"the value of '" + key + "' is an unquoted scalar containing ': ', which yaml reads as a nested mapping",
					lineNo,
					indent + (body.length - value.length) + at + 2,
				);
			}
		}
		// a leading indicator is not content
		if (!quoted && /^[&*!>|%@`]/.test(scalar)) {
			throw new FrontmatterError("an unquoted scalar begins with the indicator '" + scalar[0] + "'", lineNo, indent + 1);
		}
		// a colon that is not followed by a space is content, not an
		// indicator: "trailing colon:" is a plain scalar and every loader takes it.
		// A rule that refused it would fail a file that is fine.

		if (value === "") {
			// an empty value opens a nested mapping or list
			const child = { indent, map: {}, list: null };
			parent.map[key] = child.map;
			stack.push(child);
			// a following "- " line would make it a list; decided lazily below
			Object.defineProperty(child, "key", { value: key });
		} else {
			if (stack.at(-1)?.indent === indent && stack.at(-1)?.list === null) stack.pop();
			parent.map[key] = LIST_FIELDS.has(key) && !quoted
				? scalar.split(",").map((x) => x.trim()).filter(Boolean)
				: scalar;
		}
		out[key === undefined ? "__never" : key] = out[key]; // no-op, keeps shape clear
	});

	// second pass, for lists, which the first pass cannot see because a list is
	// only known once its first "- " line has been met
	let current = null;
	split.lines.forEach((rawLine, idx) => {
		const line = stripComment(rawLine);
		if (!line.trim()) return;
		const indent = line.length - line.trimStart().length;
		const body = line.trimStart();
		if (!body.startsWith("- ")) return;
		if (!current || current.indent >= indent) {
			// find the key this list belongs to by walking back up
			let k = idx - 1, owner = null, ownerIndent = indent;
			while (k >= 0) {
				const l = stripComment(split.lines[k]);
				if (l.trim()) {
					const li = l.length - l.trimStart().length;
					if (li < indent) { owner = (l.trimStart().match(/^([^:\s]+):/) ?? [])[1]; ownerIndent = li; break; }
				}
				k--;
			}
			if (!owner) throw new FrontmatterError("a list item has no key to belong to", idx + split.firstLine, indent + 1);
			current = { indent: ownerIndent, key: owner, items: [] };
			out[current.key] = current.items;
		}
		current.items.push(readScalar(body.slice(2)).text);
	});

	delete out.__never;
	return out;
}

// the index of the first ": " that is not inside a quoted run, or -1
function findColonSpace(value) {
	let inSingle = false, inDouble = false;
	for (let i = 0; i < value.length; i++) {
		const c = value[i];
		if (c === "'" && !inDouble) inSingle = !inSingle;
		else if (c === '"' && !inSingle) inDouble = !inDouble;
		else if (!inSingle && !inDouble && c === ":" && value[i + 1] === " ") return i;
	}
	return -1;
}

/**
 * The fields a document's frontmatter declares, whether or not it parses, for
 * the sake of a report that must name what it looked at even when it refused.
 */
export function declaredKeys(text) {
	const split = splitFrontmatter(text);
	if (!split) return [];
	return split.lines
		.map((l) => (stripComment(l).trimStart().match(/^([^:\s]+):/) ?? [])[1])
		.filter(Boolean);
}
