// Behavioural harness for extensions/kid-explorer-autostart.ts
//
// Loads the real extension under a stub ExtensionAPI and drives it. No model,
// no network, no pi binary needed — node strips the type-only import.
//
//   node test/harness/extension.harness.mjs [path-to-extension]

import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const target = process.argv[2] ?? new URL("../../extensions/kid-explorer-autostart.ts", import.meta.url).pathname;

if (!existsSync(target)) {
	process.stdout.write(`cannot find extension at ${target}\n`);
	process.exitCode = 2;
	throw new Error("missing extension");
}

// --- tiny assertion surface ------------------------------------------------
let pass = 0;
let fail = 0;
const ok = (m) => { pass++; process.stdout.write(`  \u2713 ${m}\n`); };
const no = (m, d) => {
	fail++;
	process.stdout.write(`  \u2717 ${m}\n`);
	if (d) process.stdout.write(`    ${d}\n`);
};
const eq = (m, got, want) =>
	JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
const has = (m, hay, needle) =>
	String(hay).includes(needle) ? ok(m) : no(m, `missing "${needle}" in: ${String(hay).slice(0, 120)}…`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- the stub pi -----------------------------------------------------------
function makePi() {
	const api = {
		commands: new Map(),
		handlers: new Map(),
		sent: [],
		notes: [],
		registerCommand(name, cfg) { api.commands.set(name, cfg); },
		on(event, handler) {
			if (!api.handlers.has(event)) api.handlers.set(event, []);
			api.handlers.get(event).push(handler);
		},
		sendUserMessage(text, opts) { api.sent.push({ text: String(text), opts }); },
	};
	api.ui = { notify: (msg, level) => api.notes.push({ msg: String(msg), level: String(level) }) };
	return api;
}
const ctx = (idle) => ({ isIdle: () => idle, ui: { notify: (m, l) => ctx.notes.push({ m, l }) }, notes: [] });

async function fireHandlers(api, event, ...args) {
	const list = api.handlers.get(event) ?? [];
	for (const h of list) await h({ type: event }, { isIdle: () => true, ui: { notify: () => {} } }, ...args);
	return list.length;
}

// --- load the real module --------------------------------------------------
process.stdout.write(`extension harness · ${pathToFileURL(target)}\n`);
const mod = await import(pathToFileURL(target));
if (typeof mod.default !== "function") {
	no("default export is a factory function");
	finish("extension-harness");
} else {
	ok("default export is a factory function");

	const EXT = "PI_KID_EXPLORER";

	// --- gate: off by default ------------------------------------------------
	delete process.env[EXT];
	let pi = makePi();
	await mod.default(pi);
	eq("no env → registers no commands", pi.commands.size, 0);
	eq("no env → registers no event handlers", pi.handlers.size, 0);

	for (const off of ["0", "false", "no", "off", "", "  ", "maybe"]) {
		process.env[EXT] = off;
		pi = makePi();
		await mod.default(pi);
		eq(`env "${off}" → still disabled`, pi.commands.size, 0);
	}

	// --- gate: on ------------------------------------------------------------
	for (const on of ["1", "true", "yes", "on", "TRUE", "On", " 1 "]) {
		process.env[EXT] = on;
		pi = makePi();
		await mod.default(pi);
		eq(`env "${on}" → enabled`, [...pi.commands.keys()].sort(), ["quest", "wild"]);
	}

	// --- commands are described and async ------------------------------------
	process.env[EXT] = "1";
	pi = makePi();
	await mod.default(pi);
	for (const name of ["quest", "wild"]) {
		const c = pi.commands.get(name);
		c ? ok(`/ ${name} is registered`) : no(`/ ${name} is registered`);
		if (c) {
			typeof c.description === "string" && c.description.length > 8
				? ok(`/ ${name} has a description`)
				: no(`/ ${name} has a description`);
			typeof c.handler === "function"
				? ok(`/ ${name} handler is callable`)
				: no(`/ ${name} handler is callable`);
		}
	}

	// --- /quest when idle must deal the menu ---------------------------------
	pi = makePi();
	await mod.default(pi);
	await pi.commands.get("quest").handler("", ctx(true));
	eq("/quest idle → one message sent", pi.sent.length, 1);
	if (pi.sent[0]) {
		has("/quest message loads the skill", pi.sent[0].text, "kid-explorer");
		has("/quest message asks for the deck", pi.sent[0].text, "topic-bank");
		has("/quest message asks for cards", pi.sent[0].text, "Quest Cards");
		has("/quest message sets the length limit", pi.sent[0].text, "short");
		has("/quest message demands one question", pi.sent[0].text, "one question");
		has("/quest message demands the content lens", pi.sent[0].text, "lens");
		eq("/quest idle → no warning shown", pi.notes.length, 0);
	}

	// --- /quest when busy must refuse politely -------------------------------
	pi = makePi();
	await mod.default(pi);
	const busyCtx = ctx(false);
	busyCtx.ui.notify = (m, l) => busyCtx.notes.push({ m, l });
	await pi.commands.get("quest").handler("", busyCtx);
	eq("/quest busy → sends nothing", pi.sent.length, 0);
	eq("/quest busy → warns once", busyCtx.notes.length, 1);
	if (busyCtx.notes[0]) eq("/quest busy → warning level", busyCtx.notes[0].l, "warning");

	// --- /wild -----------------------------------------------------------------
	pi = makePi();
	await mod.default(pi);
	await pi.commands.get("wild").handler("", ctx(true));
	eq("/wild idle → one message sent", pi.sent.length, 1);
	if (pi.sent[0]) has("/wild message asks for a fact", pi.sent[0].text, "Wild card");

	// --- session_start auto-deal ------------------------------------------------
	pi = makePi();
	await mod.default(pi);
	const n = await fireHandlers(pi, "session_start");
	eq("session_start handler registered", n, 1);
	await sleep(700); // the extension defers a tick so the TUI can settle
	eq("session_start idle → auto-dealt the menu", pi.sent.length, 1);
	if (pi.sent[0]) has("auto-deal mentions the menu", pi.sent[0].text, "Quest Cards");

	// --- session_start must not interrupt a running answer ---------------------
	pi = makePi();
	await mod.default(pi);
	for (const h of pi.handlers.get("session_start") ?? []) {
		await h({ type: "session_start" }, { isIdle: () => false, ui: { notify: () => {} } });
	}
	await sleep(700);
	eq("session_start while busy → stays quiet", pi.sent.length, 0);

	// --- the four suits must all be asked for ---------------------------------
	pi = makePi();
	await mod.default(pi);
	await pi.commands.get("quest").handler("", ctx(true));
	const menu = pi.sent[0]?.text ?? "";
	for (const suit of ["History", "Geography", "Animals", "Botany"]) {
		has(`menu asks for the ${suit} suit`, menu, suit);
	}

	finish("extension-harness");
}

function finish(name) {
	const total = pass + fail;
	process.stdout.write("#summary pass=" + pass + " fail=" + fail + "\n");
	if (fail) {
		process.stdout.write(`${name} ${pass}/${total} passed — FAILED\n`);
		process.exitCode = 1;
	} else {
		process.stdout.write(`${name} ${pass}/${total} passed\n`);
	}
}
