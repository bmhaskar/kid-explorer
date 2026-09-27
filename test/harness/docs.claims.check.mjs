// A documentation claim is a claim. Checked, not eyeballed.
import { existsSync, readFileSync, readdirSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const makefile = readFileSync("Makefile", "utf8");
let bad = 0;
const say = (ok, msg) => { process.stdout.write(`  ${ok ? "ok  " : "FAIL"} ${msg}\n`); if (!ok) bad++; };

// 1. every `make X` the README tells someone to run exists in the Makefile
const claimedTargets = new Set();
for (const m of readme.matchAll(/\bmake ([a-z][a-z0-9-]*)/g)) claimedTargets.add(m[1]);
const definedTargets = new Set();
for (const m of makefile.matchAll(/^([a-z][a-z0-9-]*):/gm)) definedTargets.add(m[1]);
const bogusTargets = [...claimedTargets].filter((t) => !definedTargets.has(t)).sort();
say(!bogusTargets.length, `every "make X" is a real target${bogusTargets.length ? ": " + bogusTargets.join(", ") : ""}`);

// 2. every path drawn in the layout tree exists
// the fenced block whose first line is the tree root
const blocks_ = [...readme.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
const tree = blocks_.find((b) => /^kid-explorer\//.test(b.trimStart())) ?? "";
// The tree is indented, so a name is only meaningful together with the
// directories drawn above it. Resolving every name against the repository root
// would report half the tree as missing and prove nothing at all.
const stack = [];
const resolved = [];
for (const line of tree.split("\n")) {
  const at = line.search(/[├└]──|└──|├──/);
  if (at < 0) continue;
  const rest = line.slice(at).replace(/^[├└── ]+/, "").trim();
  const name = rest.split(/\s/)[0] ?? "";
  // depth comes from the column the marker sits in, because the guide
  // characters are box-drawing glyphs and not whitespace, so a \s capture
  // cannot see them and every entry would land at depth zero
  const depth = Math.floor(at / 4);
  const bare = name.replace(/\/$/, "");
  if (!bare || bare.includes("*") || bare.startsWith("[")) continue;
  stack.length = depth;
  stack[depth] = bare;
  const rel = stack.filter(Boolean).join("/");
  if (rel) resolved.push(rel);
}
const missing = resolved.filter((n) => !existsSync(n));
say(resolved.length >= 20, `${resolved.length} layout entries were actually examined (a tree this small had to name at least 20)`);
say(!missing.length, `every layout entry exists${missing.length ? ": " + missing.join(", ") : ""}`);

// 3. relative links resolve
const links = [...readme.matchAll(/\]\(([^)#\s]+)\)/g)]
	.map((m) => m[1])
	.filter((u) => !/^https?:/.test(u) && !u.startsWith("#"));
const deadLinks = links.filter((u) => !existsSync(u));
say(!deadLinks.length, `every relative link resolves${deadLinks.length ? ": " + deadLinks.join(", ") : ""} (${links.length} checked)`);

// 4. the suite count the README states matches what run-all will discover
const onDisk = readdirSync("test").filter((f) => /^[0-9][0-9]-[a-z0-9-]+\.sh$/.test(f)).length;
const stated = [...readme.matchAll(/`(\d\d-[a-z-]+)`/g)].map((m) => m[1]);
const distinct = [...new Set(stated)];
const ghost = distinct.filter((n) => !existsSync(`test/${n}.sh`));
say(!ghost.length, `every named suite exists${ghost.length ? ": " + ghost.join(", ") : ""}`);
const says = readme.match(/the ([a-z]+|8) suites/)?.[1] ?? "?";
say(distinct.length === onDisk, `the suite table lists ${distinct.length}, run-all discovers ${onDisk} (README says "${says}")`);

// 5. commands in fenced bash blocks that name this repo's scripts must exist
const blocks = [...readme.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n");
// strip URLs first, or the path part of a documentation link is stat'd as a file
const noUrls = blocks.replace(/[A-Za-z0-9.+-]+:\/\/[^\s)'"]+/g, "");
const scripts = [...new Set([...noUrls.matchAll(/(?:^|\s|\/)([a-z0-9./-]+\.(?:sh|mjs))/g)].map((m) => m[1]))];
const missingScripts = scripts.filter((s) => !existsSync(s) && !existsSync(s.replace(/^\.?\//, "")));
say(!missingScripts.length, `every script invoked in an example exists${missingScripts.length ? ": " + missingScripts.join(", ") : ""} (${scripts.length} named)`);

process.exitCode = bad ? 1 : 0;
