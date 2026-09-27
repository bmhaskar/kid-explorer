// Proves the parser against the failure that motivated it, and against the
// things a parser must not cry wolf about.
//
// A validator written after a bug has one duty beyond catching that bug: it
// must not catch things that are fine, because a suite that cries wolf is
// edited until it stops saying anything at all. So the good shapes below are as
// much the test as the bad ones, and several of them are taken from forms this
// repository actually ships.
import { parseFrontmatter, splitFrontmatter, FrontmatterError } from "./frontmatter.parser.mjs";
import { readFileSync } from "node:fs";

let bad = 0;
const say = (ok, name, detail) => {
	if (!ok) bad++;
	process.stdout.write(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail && !ok ? "   → " + detail : ""}\n`);
};

function accepts(name, doc) {
	try { parseFrontmatter(doc); say(true, name); return {}; }
	catch (e) { say(false, name, e.message + " (line " + e.line + ", column " + e.column + ")"); return null; }
}
function rejects(name, doc, mustMention) {
	try { parseFrontmatter(doc); say(false, name, "it was accepted"); return null; }
	catch (e) {
		const mentions = !mustMention || e.message.includes(mustMention);
		say(mentions, name, mentions ? undefined : `said "${e.message}"`);
		return e;
	}
}

process.stdout.write("\nthe shape that broke the child's install, and its repair\n");
rejects(
	"an unquoted value carrying ': ' is refused",
	"---\nname: kid-explorer\ndescription: Holds it safe: no wrong answers.\n---\n\n# Body\n",
	"nested mapping",
);
accepts(
	"the same value quoted is taken",
	"---\nname: kid-explorer\ndescription: 'Holds it safe: no wrong answers.'\n---\n\n# Body\n",
);

process.stdout.write("\nthe good shapes, several of them shipped by this very repository\n");
accepts("a plain block", "---\nname: a\ndescription: b\n---\n");
accepts("a value with a colon but no space after it", "---\nname: a\ndescription: see http://example.test/x\n---\n");
accepts("a value with a colon at its end but no space", "---\nname: a\ndescription: trailing colon:\n---\n");
accepts("a value with a comma, a semicolon and brackets", "---\nname: a\ndescription: one (a, b; c) [d]\n---\n");
accepts("a double-quoted value carrying a colon", '---\nname: a\ndescription: "safe: yes"\n---\n');
accepts("an apostrophe in an unquoted value", "---\nname: a\nnot-for: one's own work, coding tasks\n---\n");
accepts("a nested mapping two spaces in", "---\nname: a\nmetadata:\n  audience: child 12+\n  guardian-review: skim it\n---\n");
accepts("a comment after a value", "---\nname: a\ndescription: b  # a note\n---\n");
accepts("a hash inside a quoted value", "---\nname: a\ndescription: 'use # for a note'\n---\n");
accepts("an empty value opening a block", "---\nname: a\nmetadata:\n  x: y\n---\n");

process.stdout.write("\nthe bad shapes a loader would also refuse\n");
rejects("a tab used for indentation", "---\nname: a\nmetadata:\n\tx: y\n---\n", "tab");
rejects("a line that is neither mapping nor list", "---\nname: a\njust some words\n---\n", "neither");
rejects("an unquoted value opening with an indicator", "---\nname: a\ndescription: @staff\n---\n", "indicator");
rejects("a document with no frontmatter at all", "# Kid Explorer\n\nbody\n", "no '---'");

process.stdout.write("\nthe file that failed on the child's machine, as it now stands\n");
try {
	const doc = readFileSync(new URL("../../SKILL.md", import.meta.url).pathname, "utf8");
	const parsed = parseFrontmatter(doc);
	say(parsed.name === "kid-explorer", "SKILL.md parses, and names itself", "name was " + parsed.name);
	say(typeof parsed.description === "string" && parsed.description.length > 40,
		"the description survived the quoting intact",
		JSON.stringify(String(parsed.description).slice(0, 60)));
	say(parsed.description?.includes("psychologically safe: he cannot be in trouble") === true,
		"and it still says the thing it was written to say",
		"the colon-bearing clause is missing, so the quoting pass changed the words");
	say(Array.isArray(parsed["allowed-tools"]), "the tools granted are a list", JSON.stringify(parsed["allowed-tools"]));
} catch (e) {
	say(false, "SKILL.md parses", e.message + " (line " + e.line + ", column " + e.column + ")");
}

process.stdout.write(`\n  ${bad ? `${bad} check(s) failed` : "the parser catches what a loader catches, and nothing else"}\n`);
process.exitCode = bad ? 1 : 0;
