// Built-in harness registry. Data only — no logic, no hand-copied files.
//
// Adding a host does not require editing this file. Drop a JSON file into
// adapters/harnesses/ (contract in adapters/harnesses/README.md) and it is
// picked up, validated, and built by the same pipeline. A file there may also
// override a built-in by using the same key, which matters because these
// conventions shift between releases and a parent should be able to correct a
// path without patching this project.
//
// kind:
//   skill  the host reads a SKILL.md tree            → emit the skill
//   rules  the host reads a rules file, no SKILL.md  → emit the guard rail as a rule
//   both   it reads both                             → emit both
//
// Every entry records where its facts came from. A wrong path or tool name
// fails quietly — the skill still installs, the host still starts, and the
// child simply never gets the guard rails — so the provenance is part of the
// data, and the portability suite checks the paths are non-empty and distinct.

export const REGISTRY = {
	pi: {
		label: "pi",
		kind: "skill",
		projectDir: ".pi/agent/skills",
		homeDir: ".pi/agent/skills",
		allowedTools: ["web_search", "fetch_content", "get_search_content", "read"],
		deniedTools: [],
		contextFile: null,
		slashCommand: "/skill:kid-explorer",
		note: "pi also reads .agents/skills, so the generic install works here too.",
		source: "pi docs/skills.md",
	},

	claude: {
		label: "Claude Code",
		kind: "skill",
		projectDir: ".claude/skills",
		homeDir: ".claude/skills",
		allowedTools: ["WebSearch", "WebFetch", "Read", "Grep", "Glob"],
		// allowed-tools pre-approves; it does not restrict. So the tools that could
		// hurt a child are removed explicitly for the invoking turn, by the field
		// that actually removes them, rather than left unmentioned in a comment.
		deniedTools: ["Bash", "Edit", "MultiEdit", "Write", "NotebookEdit"],
		contextFile: "CLAUDE.md",
		slashCommand: "/kid-explorer",
		note: "claude.ai uploads accept only the six spec fields, so no host-only field is emitted that the generic build does not also emit.",
		source: "Claude Code docs/en/skills",
	},

	codex: {
		label: "Codex",
		kind: "skill",
		projectDir: ".agents/skills",
		homeDir: ".agents/skills",
		allowedTools: ["web_search", "read_file"],
		deniedTools: [],
		contextFile: "AGENTS.md",
		slashCommand: "$kid-explorer  (or /skills)",
		note: "REPO scope scans .agents/skills from the working directory up to the repository root, so the portable location is the native one. The tool surface is declared in agents/openai.yaml, which the build emits.",
		source: "Codex docs/codex/skills",
	},

	gemini: {
		label: "Gemini CLI",
		kind: "skill",
		projectDir: ".gemini/skills",
		homeDir: ".gemini/skills",
		allowedTools: ["web_search", "web_fetch", "read_file", "read_many_files"],
		deniedTools: ["run_shell_command", "write_file", "replace"],
		contextFile: "GEMINI.md",
		slashCommand: "/kid-explorer",
		note: "Also honours the .agents/skills alias, so the generic install works here too.",
		source: "Gemini CLI docs/cli/skills",
	},

	opencode: {
		label: "OpenCode",
		kind: "skill",
		projectDir: ".opencode/skills",
		homeDir: ".config/opencode/skills",
		allowedTools: ["websearch", "webfetch", "read", "grep", "glob"],
		deniedTools: ["bash", "edit", "write", "patch"],
		contextFile: "AGENTS.md",
		slashCommand: "/kid-explorer",
		note: "Auto-loads the .claude/skills and .agents/skills compatibility locations at both scopes, so one install covers several hosts. Extra directories via the skills array in opencode.json.",
		source: "OpenCode docs/skills",
	},

	devin: {
		label: "Devin CLI",
		// a skills directory plus one rules file, which is kind "skill" with a
		// contextFile — not kind "both", which would promise a rules directory
		// that Devin does not read
		kind: "skill",
		projectDir: ".devin/skills",
		homeDir: ".config/devin/skills",
		allowedTools: ["web_search", "read_file"],
		deniedTools: ["bash", "write_file", "edit_file"],
		contextFile: "AGENTS.md",
		slashCommand: "/kid-explorer",
		note: "Skills live in .devin/skills/<name>/SKILL.md; always-on rules are AGENTS.md at the project root, with AGENTS.local.md for personal overrides and ~/.config/devin/AGENTS.md for global rules. Devin CLI also imports rules it finds from Cursor, Windsurf, Claude Code, Copilot, OpenCode, VS Code, and Zed.",
		source: "Devin docs/cli/extensibility",
	},

	cursor: {
		label: "Cursor",
		// Cursor has no SKILL.md. It has rules: .cursor/rules/*.mdc, and a plain
		// .md there is ignored, so the extension is load-bearing and is data here.
		kind: "rules",
		rulesDir: ".cursor/rules",
		rulesExt: "mdc",
		rulesName: "kid-explorer",
		// The three fields Cursor reads, which together give the four rule types.
		// alwaysApply true makes it a rule of every conversation, which is what a
		// safety rail has to be; a rule the agent may choose to ignore is not a rail.
		rulesFrontmatter: {
			description: "Child-safety guard rails for the kid-explorer conversations: no graphic detail, no harm instructions, no fear content; every feeling allowed; stop words always honoured.",
			globs: "",
			alwaysApply: true,
		},
		allowedTools: [],
		deniedTools: [],
		contextFile: "AGENTS.md",
		// Cursor has nothing to load on demand, so the whole policy has to be carried
		// into the context file. Without this the child gets the eight-line summary and
		// never the detail, and the two confusions never reach the model at all.
		inlineBody: true,
		slashCommand: "@kid-explorer",
		note: "Cursor reads AGENTS.md and CLAUDE.md from the project root as well, so the guard rail is written there too and the .mdc rule is the always-on half.",
		source: "Cursor docs/rules",
	},

	generic: {
		label: "any Agent Skills host",
		kind: "skill",
		projectDir: ".agents/skills",
		homeDir: ".agents/skills",
		allowedTools: ["web_search", "fetch_content", "get_search_content", "read"],
		deniedTools: [],
		contextFile: "AGENTS.md",
		slashCommand: "/kid-explorer",
		note: "The portable location. Read by pi, Codex, Gemini CLI, OpenCode, and Devin without any adapter.",
		source: "agentskills.io/specification",
	},
};

// The tools no adapter may ever grant, in any host, under any spelling.
// The build refuses a spec that lists one, and the portability suite greps the
// emitted frontmatter for them as a second, independent net.
export const NEVER_GRANT = [
	// pi
	"bash", "edit", "write",
	// Claude Code
	"Bash", "Edit", "MultiEdit", "Write", "NotebookEdit",
	// Codex
	"shell", "shell_command", "exec_command", "apply_patch", "local_shell", "update_plan",
	// Gemini CLI
	"run_shell_command", "write_file", "replace", "save_memory",
	// OpenCode
	"bash", "edit", "write", "patch",
	// Devin
	"bash", "write_file", "edit_file",
	// Cursor and friends
	"execute_command", "apply_diff", "launch-process", "codebase_edit", "shell",
];

// Clauses that must survive translation, checked verbatim. A safety rule that
// has been paraphrased is a safety rule that has already begun to drift.
//
// The two lists answer different questions, and collapsing them into one would
// make the check either vacuous or wrong:
//
//   CORE_IN_SKILL  must be in SKILL.md itself. That is the half a host loads
//                  before it decides whether to use the skill, so a rule that
//                  arrives only after that decision is a rule that arrived too
//                  late to matter.
//   MUST_SURVIVE   must appear somewhere in the emitted package — SKILL.md or
//                  any reference — because the references are copied verbatim
//                  and are where the detail lives.
export const CORE_IN_SKILL = [
	"You cannot be in trouble here",
	"There is no wrong answer",
	"Every feeling is allowed",
	"Stop words always work",
	"No private data",
	"Never paste raw web output",
	"A refusal of detail is not a refusal of him",
	"A boundary is not a punishment",
];

export const MUST_SURVIVE = [
	"You cannot be in trouble here",
	"There is no wrong answer",
	"Every feeling is allowed",
	"Stop words always work",
	"No private data",
	"Never paste raw web output",
	"stop the game immediately",
	"trusted grown-up",
	"Never promise secrecy",
	"seven checks",
	"A refusal of detail is not a refusal of him",
	"A boundary is not a punishment",
];

// The always-on guard rail. Hosts load a skill body only when they decide to
// use it (progressive disclosure), which is the wrong moment for a child-safety
// rule: the first reply of a session can arrive before the body is ever read.
// So the non-negotiables are also written to the host's persistent rules file,
// in a block small enough to cost nothing and short enough to be read every
// time. It is a summary; the skill stays the authority.
export const GUARD_RAIL = [
	"## Kid Explorer — the things that hold even before the skill is read",
	"",
	"When the person you are talking to is the child rather than the grown-up, these",
	"hold from the first reply, whether or not the `kid-explorer` skill has loaded.",
	"",
	"- **He cannot be in trouble here.** Not by you, not by his family, not by",
	"  anything he says. Say so, out loud, in the first two turns.",
	"- **There is no wrong answer.** Guessing is the brave thing. Never mark an answer",
	"  as good or bad, and never let the curiosity count fall.",
	"- **Every feeling is allowed.** You may decline a *detail*; you may never decline",
	"  a *feeling*.",
	"- **Stop words always work.** `stop`, `next`, `break`, `no`, `not now`. Honour at",
	"  once, ask no reason, ask no follow-up question.",
	"- **No graphic detail, no instructions for harm, no glorification, no fear",
	"  content, no adult content.** War and disaster are bridged to what humans",
	"  invented, rescued, measured, and rebuilt.",
	"- **Never paste raw web output.** Inspect a search result against the seven checks",
	"  first, then rewrite it in your own words. Never print a URL to him.",
	"- **If he is frightened or in distress, stop the game**, drop all formatting,",
	"  speak plainly, and point him to a trusted grown-up. Never promise secrecy.",
	"- **You are a companion, not a report.** Write nothing about him to anyone.",
	"",
	"Read the `kid-explorer` skill for the whole of it. Everything above is a",
	"summary; the skill is the authority, and where the two differ, the skill wins.",
];

// The rail is a summary, so it cannot be held to the SKILL.md set — it does not
// carry the two-confusions wording or the private-data heading, and demanding it
// would either bloat the rail past the point of being read every time or force
// a false claim that the rail says something it does not. These are the clauses
// the rail itself must never lose, because they are the ones it exists to carry.
export const RAIL_MUST_HOLD = [
	"cannot be in trouble here",
	"There is no wrong answer",
	"Every feeling is allowed",
	"Stop words always work",
	"Never paste raw web output",
	"seven checks",
	"trusted grown-up",
	"Never promise secrecy",
	"stop the game",
];

// Marker pair used to find and replace a previously emitted block, so that
// re-running is idempotent and never nests a second rail inside the first.
export const GUARD_MARK_BEGIN = "<!-- begin kid-explorer guard rail (generated; do not edit by hand) -->";
export const GUARD_MARK_END = "<!-- end kid-explorer guard rail -->";

// A rules-only host has no on-demand skill file to reach for the detail, so the
// body has to be carried into the always-loaded context. It gets its own marker
// pair so that the summary rail and the full text can be regenerated apart, and
// so that a hand-edit to one cannot silently strand the other.
export const BODY_MARK_BEGIN = "<!-- begin kid-explorer policy (generated; do not edit by hand) -->";
export const BODY_MARK_END = "<!-- end kid-explorer policy -->";

// Fields every harness spec must carry, whatever its kind.
export const REQUIRED_FIELDS = ["label", "kind"];

// Fields required per kind, so that a rules host cannot be declared without
// saying where the rules go, and a skill host cannot be declared without a
// directory to put the skill in.
export const REQUIRED_BY_KIND = {
	skill: ["projectDir", "allowedTools"],
	rules: ["rulesDir", "rulesExt", "rulesFrontmatter"],
	both: ["projectDir", "allowedTools", "rulesDir", "rulesExt", "rulesFrontmatter"],
};

export const KINDS = ["skill", "rules", "both"];
