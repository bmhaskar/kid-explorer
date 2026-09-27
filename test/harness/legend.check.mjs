// Locale-independent check of the fixed symbol alphabet in SKILL.md.
//
// bash cannot emit \U escapes without a UTF-8 locale, so the glyph contract is
// verified in node instead. The point: the child sees the same symbols with the
// same meanings, always. A new or repurposed glyph is a regression.
//
//   node test/harness/legend.check.mjs path/to/SKILL.md

import { readFileSync } from "node:fs";

const file = process.argv[2] ?? new URL("../../SKILL.md", import.meta.url).pathname;
const text = readFileSync(file, "utf8");

// The four symbols of the turn skeleton. These must always be present, and
// must always mean what they mean here.
const TURN_LEGEND = [
	[0x1F50D, "knowledge"],
	[0x1F4A1, "why it matters"],
	[0x1F3C5, "progress"],
	[0x2753, "your turn"],
];

// Everything else the skill is allowed to show. Add to this list deliberately,
// with a meaning, when a new mode is introduced.
const MENU_AND_MODES = [
	[0x1F5FA, "quest card"],
	[0x1F0C0, "wild card"],
	[0x1F30D, "time bridge"],
	[0x1F9ED, "situation corner"],
	[0x1F33F, "botany suit"],
	[0x1F4CB, "parent note"],
];

// Plain typography, not part of the legend: these carry no meaning the child
// has to learn, so they are allowed anywhere.
const TYPOGRAPHY = [
	[0x2190, "leads to"],
	[0x2192, "instead"],
];

const ALPHABET = new Map([...TURN_LEGEND, ...MENU_AND_MODES, ...TYPOGRAPHY].map(([cp, m]) => [cp, m]));
const cpName = (cp) => `U+${cp.toString(16).toUpperCase().padStart(6, "0")}`;

let pass = 0;
let fail = 0;
const ok = (m) => { pass++; process.stdout.write(`  \u2713 ${m}\n`); };
const no = (m, d) => {
	fail++;
	process.stdout.write(`  \u2717 ${m}\n`);
	if (d) process.stdout.write(`    ${d}\n`);
};

// --- the turn legend must be complete --------------------------------------
for (const [cp, meaning] of TURN_LEGEND) {
	const ch = String.fromCodePoint(cp);
	text.includes(ch)
		? ok(`turn symbol ${cpName(cp)} present — ${meaning} (${ch})`)
		: no(`turn symbol ${cpName(cp)} missing — ${meaning}`);
}

// --- every glyph used must be a documented one -----------------------------
const used = new Set(
	(text.match(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu) ?? []).map((m) => m.codePointAt(0)),
);
const undocumented = [...used].filter((cp) => !ALPHABET.has(cp)).sort();
if (undocumented.length) {
	no(
		`${undocumented.length} undocumented glyph(s) — the child would meet an unexplained symbol`,
		undocumented.map((cp) => `${cpName(cp)} ${String.fromCodePoint(cp)}`).join(", "),
	);
} else {
	ok(`every glyph used (${used.size}) is part of the documented alphabet`);
}

// --- the four must be distinct, and the whole alphabet must be distinct ----
const distinct = new Set(ALPHABET.keys());
distinct.size === ALPHABET.size
	? ok(`the ${ALPHABET.size}-symbol alphabet has no duplicates`)
	: no("the alphabet contains duplicate code points");

// --- the legend must be declared exactly once, and forbid invention -------
const declarations = text.split("\n").filter((l) => /Legend \(fixed/i.test(l));
declarations.length === 1
	? ok("the legend is declared exactly once")
	: no(`the legend should be declared once, found ${declarations.length}`);

text.includes("never invent new symbols")
	? ok("the skill forbids inventing new symbols")
	: no("the skill should explicitly forbid inventing new symbols");

// --- the turn skeleton must use them in order ------------------------------
const skeleton = text.slice(
	text.indexOf("\u{1F50D} <"),
	text.indexOf("\u{2753} <") + 40,
);
if (skeleton.length > 40) {
	const order = [...skeleton.matchAll(/[\u{1F50D}\u{1F4A1}\u{1F3C5}\u{2753}]/gu) ?? []]
		.map((m) => m[0].codePointAt(0));
	const want = TURN_LEGEND.map(([cp]) => cp);
	JSON.stringify(order) === JSON.stringify(want)
		? ok("the turn skeleton uses the four symbols in the documented order")
		: no(
				"the turn skeleton reorders the legend",
				`got ${order.map((cp) => cpName(cp)).join(" → ")}`,
			);
} else {
	no("the turn skeleton could not be located in SKILL.md");
}

const total = pass + fail;
process.stdout.write("#summary pass=" + pass + " fail=" + fail + "\n");
if (fail) {
	process.stdout.write(`legend ${pass}/${total} passed — FAILED\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(`legend ${pass}/${total} passed\n`);
}
