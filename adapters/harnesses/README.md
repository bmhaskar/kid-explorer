# Adding a harness

The skill is written once, in `../SKILL.md` and `../references/`. Everything
under `build/` is generated. Nothing here is copied by hand, because N hand-kept
copies of a child-safety policy is N chances for one of them to drift, and drift
in a safety policy is silent: the skill still installs, the host still starts,
and the child simply gets weaker rules than the ones that were reviewed.

## You do not need to touch this repository

Drop a file in a directory the build already reads:

```
adapters/harnesses/<name>.harness.json        shared, committed with the project
$KID_EXPLORER_HARNESS_DIR/<name>.harness.json one directory per entry, on PATH-free lookup
~/.config/kid-explorer/harnesses/             this family only
```

Later wins, so you can also correct a built-in without patching it — which
matters, because these hosts rename their conventions between releases and a
parent should be able to follow without waiting on upstream.

Then:

```bash
node adapters/build.mjs --list                     # your host appears in the list
node adapters/build.mjs --harness <name> --out build
node adapters/build.mjs --verify  <name> --out build
./install.sh --harness <name> --project ~/my-project
```

`windsurf.harness.json` beside this file is a complete worked example, and the
test suite installs and verifies it the same way it does the built-ins.

## The contract

```jsonc
{
  "label": "Windsurf",              // required, for humans
  "kind":  "rules",                // required: skill | rules | both

  // kind skill | both — where the SKILL.md tree goes
  "projectDir": ".windsurf/skills", //   relative, no "..", from the project root
  "homeDir":    ".windsurf/skills", //   relative, no "..", from $HOME
  "allowedTools": ["web_search", "read_file"],
  "deniedTools":  ["run_terminal"],

  // kind rules | both — where the always-on rule goes
  "rulesDir":  ".windsurf/rules",   //   relative, no ".."
  "rulesExt":  "mdc",              //   bare, no dot; some hosts ignore .md here
  "rulesName": "kid-explorer",
  "rulesFrontmatter": {             //   scalars only — see below
    "description": "Child-safety guard rails.",
    "alwaysApply": true
  },

  "contextFile": "AGENTS.md",       // a bare name ending .md, or null
  "inlineBody":  false,             // true when the host has nothing to load later
  "slashCommand": "@kid-explorer",
  "note": "anything the next reader needs",
  "source": "where these facts came from"
}
```

### `kind`

| kind | meaning | emits |
|---|---|---|
| `skill` | the host reads a `SKILL.md` tree | the skill, plus the rail in `contextFile` |
| `rules` | the host reads a rules file, and has no skill to read | the rule file, plus the rail in `contextFile` |
| `both` | it reads a skill tree *and* a separate rule file | all three |

### `inlineBody`

Set it to `true` when the host has **no file to reach for later**.

A host with skills loads a body on demand, when it decides the task is
relevant. That is the right shape for a capability and the wrong shape for a
safety rule, because the first reply of a session can arrive before the body is
ever read. A rules-only host never gets to make that decision at all, so for it
the summary rail is the only thing that would ever arrive — and the summary is
eight lines, which does not carry the whole policy.

Cursor and Windsurf both set this. When it is set, the complete body is written
into `contextFile` in its own marked block, and the verifier holds that file to
the full clause list.

### `rulesFrontmatter`

Keys are the host's own vocabulary — Cursor names one `alwaysApply` and another
`agentRequest`, and refusing a correct host over spelling would only teach
people to bypass the validator. **Values must be scalars.** A nested value can
smuggle a second document, or a further instruction, into a file that is loaded
into every conversation, which is precisely the place that must not be given to
anyone's unexamined text. The build refuses a spec that does this, and the
suite proves that it refuses.

## What you cannot change

The registry is open. The invariants are not. Every entry is checked against
the same rules, whoever wrote it, and these are not configurable per host:

- **`allowedTools` may never grant a shell, a file write, or a patch** —
  `NEVER_GRANT` in `../harnesses.mjs` is checked case-insensitively against
  every spelling every host uses. A spec that asks for one is refused, and the
  emitted frontmatter is grepped for them independently.
- **The clauses in `CORE_IN_SKILL` must be in `SKILL.md` itself**, in every
  host, because that is the half loaded before the host decides anything.
- **The clauses in `MUST_SURVIVE` must appear somewhere in the emitted
  package**, and for a host with `inlineBody` they must be in the context file,
  because that is the only thing it will ever load.
- **The body is never rewritten.** Only the frontmatter is edited. The suite
  compares the bytes of every generated body against the source, for every
  host, and fails on a single differing byte — including against a build where
  somebody has "just quickly" corrected one line of the policy by hand.
- **The rail is regenerated between two markers**, so re-running is safe and
  blocks cannot nest. Several hosts share one `AGENTS.md`; each replaces only
  its own block and leaves the others.

If you believe one of those is wrong for your host, that is a bug worth
reporting rather than a constraint to work around, because the reason it is
there is a specific child.

## When a host changes its mind

Hosts rename their directories and their tools between releases. Correct it in a
file in one of the directories above, using the built-in's key, and the built-in
is overridden for you. Record what changed and where you read it in `source`,
because a wrong path fails quietly: the skill installs, the host starts, and
the guard rails are simply never read.
