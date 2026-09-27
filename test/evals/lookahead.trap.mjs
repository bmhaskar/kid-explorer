// The trap, written down because it is invisible in the source of the pattern
// that contains it, and because I got its diagnosis wrong twice before I
// measured it.
//
// A pattern assembled from pieces is only as anchored as the pieces plus the
// whole. Each piece carries the *default* anchor of whatever it is tried in,
// because none of them says `^` and an unanchored pattern matches anywhere.
//
//   A = (?=.*gory)   tried alone, against a string containing gory  → true
//   B = (?=.*glad)   tried alone, against a string containing glad  → true
//   A then B         tried together                                  → FALSE
//
// The conjunction of two things that are each true is not itself true here, and
// that is not a paradox: both lookaheads are zero-width, so both are evaluated
// at the same position, and the second one's `.*` has to reach from that one
// position over the whole string while the first one's has already done the
// same. What differs between them is only which word they are looking for, and
// the string is long, and the reply has a newline in it, and `.` does not cross
// a newline.
//
// That last clause is the whole of it. The reply is two paragraphs with a blank
// line between them. The thing refused is in the first paragraph and the warmth
// is in the first paragraph too, but the pattern does not know which paragraph
// either is in, and it is asked to find both from one position with a `.` that
// cannot cross the blank line. So the conjunction fails where either half, tried
// on its own against the whole, succeeds.
//
// The lesson is not about lookaheads. It is that a rule assembled from parts,
// each of which was tested, is not thereby tested; and that `.` meaning "any
// character except a line terminator" is the kind of thing that has to be said
// out loud when a reply is allowed to have paragraphs in it.

const text = "I am not going to talk about the gory bits. I am always glad to hear what you think.";
const textWithParagraphs = "I am not going to talk about the gory bits.\n\nI am always glad to hear what you think.";

const A = "(?=.*gory)";
const B = "(?=.*glad)";

const rows = [
	["A alone, one paragraph", A, text],
	["B alone, one paragraph", B, text],
	["A and B, one paragraph", A + B, text],
	["A alone, two paragraphs", A, textWithParagraphs],
	["B alone, two paragraphs", B, textWithParagraphs],
	["A and B, two paragraphs", A + B, textWithParagraphs],
	["A and B, two paragraphs, dot-all", A.replace(".", "[\\s\\S]") + B.replace(".", "[\\s\\S]"), textWithParagraphs],
];

process.stdout.write("  the same two halves, the same reply, with and without a blank line:\n\n");
for (const [name, src, subject] of rows) {
	let got;
	try { got = new RegExp(src, "i").test(subject); }
	catch (e) { got = "could not be built: " + e.message; }
	process.stdout.write(`  ${String(got).padEnd(22)}  ${name}\n`);
}

process.stdout.write("\n  a rule that cannot be satisfied does not keep anybody safe. It keeps\n");
process.stdout.write("  only failures, and every one of them is blamed on the skill rather than\n");
process.stdout.write("  on the pattern, which is the worst thing an instrument can do to the\n");
process.stdout.write("  thing it measures.\n");
