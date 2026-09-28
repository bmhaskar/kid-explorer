# Kid Explorer — a conversation skill for a curious 12-year-old

A conversation skill for a bright 12-year-old on the autism spectrum with ADHD
who loves history, geography, animals, and botany. Written for
[pi](https://github.com/earendil-works/pi), and it installs the same policy
onto Claude Code, Codex, Gemini CLI, OpenCode, Devin, Cursor, and anything else
that reads the [Agent Skills](https://agentskills.io) layout.

It turns "what shall we talk about?" into a small card game, and puts a firm,
quiet **content lens** over everything the agent says — including anything it
pulls off the web.

The policy is written **once**, in `SKILL.md` and `references/`. Everything a
host needs is generated from it, so there is one text to review rather than one
per agent, and the test suite proves the bytes match.

## What it does

| | |
|---|---|
| **Quest Cards** | On session start the agent deals 4 topic cards — one History, one Geography, one Animals, one Botany. He picks a number, or names his own topic, or says `wild`. |
| **The lens** | Every answer passes seven checks before he sees it: age, violence, harm instructions, hate, fear, accuracy, privacy. Raw web results are never pasted. |
| **Time Bridge** | He is drawn to wars and catastrophes. The skill does not ban them — it bridges them. *"A world war from 1914 to 1918"* → then the whole turn on penicillin, radar, the jet engine, insulin, blood banks, and what the world built afterwards. |
| **Situation Corner** | Social-situation coaching. What happened, what each person felt, what the cues were, the exact words to say, one rule to keep. |
| **The space is safe** | Before anything else, four things are said out loud: he cannot be in trouble here, there is no wrong answer, every feeling is allowed, and stop words always work. The agent can be told it is wrong, and must then concede in the open. Full rules in `references/emotional-safety.md`. |
| **Curiosity coins** | A counter for the dopamine the task needs — of having a go, never of quality. It only ever goes up: it cannot be lost, reset, or run out, a wrong guess earns it as much as a right one, and he may ask for it to be left out. |

## Design notes for the autism + ADHD profile

- **Predictable.** The same turn skeleton every single reply. No surprises.
- **Short.** 100–150 words. Never over 200. Bullets, not walls.
- **Literal.** No idiom, no sarcasm, no rhetorical questions.
- **One question per turn**, always last. Never two.
- **Hyperfocus is honoured.** If he wants 20 turns on Roman concrete, he gets them.
- **No masking demanded.** It teaches what other people's signals mean; it never
  tells him to act neurotypical.
- **Exit always open.** `next`, `wild`, a break offer, and "get a grown-up" are
  always available moves.
- **Safety escalation.** Any sign of distress stops the game, drops all formatting,
  and points to a trusted adult. No secrecy, ever.

## Install

### One line, on the child's machine

```bash
curl -fsSL https://raw.githubusercontent.com/bmhaskar/kid-explorer/main/install.sh | bash
```

That installs for **pi**. For another agent, pass the host and the project:

```bash
curl -fsSL https://raw.githubusercontent.com/bmhaskar/kid-explorer/main/install.sh \
  | bash -s -- --harness claude --project ~/my-project
```

The installer is self-fetching: run it from anywhere, even piped with no
checkout present, and it pulls the upstream archive and installs from that.
It verifies the package is complete before writing anything, refuses loudly
if it is not, and leaves the previous install as a timestamped backup.

Installing for a host other than pi needs `node` on `PATH`, because the
adapters are generated rather than shipped as copies.

### From a clone

```bash
git clone https://github.com/bmhaskar/kid-explorer.git
cd kid-explorer
./install.sh            # skill + the optional auto-menu extension
./install.sh --skill    # skill only, no extension
```

### For another agent

```bash
./install.sh --list-harnesses                       # what this build knows
./install.sh --harness cursor --project ~/my-project
./install.sh --all-harnesses --project ~/my-project
```

An unknown name is not a dead end. Either pass the two facts that matter and
install once:

```bash
node adapters/build.mjs --harness myhost --kind rules \
     --rules-dir .myhost/rules --rules-ext mdc --context-file AGENTS.md --out build
```

A `rules` host needs `--rules-dir` and `--rules-ext`; a `skill` host needs
`--kind skill` and `--project-dir`. Both take the optional flags below, and the
rule's frontmatter is filled in for you when you do not name it — a rail the
agent may choose to ignore is not a rail, so it always applies unless you say
otherwise.

| Option | Meaning |
|---|---|
| `--kind skill\|rules\|both` | which half the host can read |
| `--rules-dir DIR` `--rules-ext EXT` | where the rule goes, and with which extension (some hosts ignore `.md` there) |
| `--rules-name NAME` | file name, default `kid-explorer` |
| `--rules-description TEXT` | what the rule is, which is what makes a host surface it |
| `--rules-always-apply true\|false` | default `true` |
| `--project-dir DIR` `--home-dir DIR` | where the skill tree goes, for a skill host |
| `--allow-tools a,b` `--deny-tools x,y` | the tool surface, in that host's names |
| `--label TEXT` | how the host is named in the output |
| `--list` | the hosts this build knows, and which half each can read |
| `--out DIR` | where to write, default `build` |
| `--scope project\|home\|both` | which copy to emit, default `project` |
| `--dry-run` | print what would be written and write nothing |
| `--verify NAME\|all` | re-check what is in `--out` against what the registry promises, and say where they differ |
| `--context-file FILE.md` | the always-on rules file, or none |
| `--scope project\|home\|both` | which half to emit |
| `--in-place` | write into the real tree so hosts sharing a context file merge |

…or keep it, by dropping `myhost.harness.json` in `adapters/harnesses/`, in
`$KID_EXPLORER_HARNESS_DIR`, or in `~/.config/kid-explorer/harnesses/`. It is
then validated, built, installed, and tested by the same code path as the
built-ins — including the one shipped here as an example, `windsurf`. The
contract is in [`adapters/harnesses/README.md`](adapters/harnesses/README.md).

### By hand

```
~/.pi/agent/skills/kid-explorer/                  the skill
~/.pi/agent/extensions/kid-explorer-autostart.ts  optional, auto-deals the menu
```

Then restart pi, or run `/reload` inside a running session.

### Installer flags

| Flag | Effect |
|---|---|
| `--skill`, `--no-ext`, `--without-extension` | Install the skill only, without the extension. All three spellings are accepted. |
| `--harness NAME` | Install for one host: `pi`, `claude`, `codex`, `gemini`, `opencode`, `devin`, `cursor`, `generic`, or a name you added. |
| `--all-harnesses` | Install for every host the registry knows. |
| `--project DIR` | Where the project copy goes. Default `$PWD`. |
| `--list-harnesses` | Print the hosts this build knows, read from the registry. |
| `--from URL` | Install a specific archive tarball instead of the default upstream. |
| `--repo OWNER/NAME` | Upstream to fetch from (default `bmhaskar/kid-explorer`). |
| `--branch NAME` | Branch to fetch (default `main`). |
| `--offline` | Never touch the network. If there is no local checkout, refuse. |
| `--help` | Usage. Works even when the script was piped. |

`PI_HOME` is honoured, so you can trial an install anywhere:

```bash
PI_HOME=/tmp/trial ./install.sh && find /tmp/trial -type f
```

## Which agents it runs on

| Agent | Shape | Where it goes | How to call it | Notes |
|---|---|---|---|---|
| **pi** | skills | `.pi/agent/skills/` | `/skill:kid-explorer` | also reads `.agents/skills/` |
| **Claude Code** | skills | `.claude/skills/`, `~/.claude/skills/` | `/kid-explorer` | `allowed-tools` only pre-approves, so the harmful tools are removed by `disallowed-tools` |
| **Codex** | skills | `.agents/skills/` | `$kid-explorer`, or `/skills` | repo scope; the tool surface goes in `agents/openai.yaml`, which is emitted |
| **Gemini CLI** | skills | `.gemini/skills/` | `/kid-explorer` | honours the `.agents/skills/` alias too |
| **OpenCode** | skills | `.opencode/skills/`, `~/.config/opencode/skills/` | `/kid-explorer` | auto-loads the `.claude/skills` and `.agents/skills` compatibility locations |
| **Devin CLI** | skills | `.devin/skills/`, `~/.config/devin/skills/` | `/kid-explorer` | rules via `AGENTS.md`, with `AGENTS.local.md` for personal overrides |
| **Cursor** | rules | `.cursor/rules/*.mdc` | `@kid-explorer` | has no skill to load, so the whole policy is inlined into `AGENTS.md` |
| **anything else** | — | `.agents/skills/` | `/kid-explorer` | the portable location; `--harness generic` |

Two things are true of every row, and they are the reason the table exists:

1. **The body is one text.** The suite compares the bytes of every generated
   body against `SKILL.md`, for every host, and fails on one differing byte.
   N hand-kept copies of a safety policy is N chances to drift, and drift in a
   safety policy is silent.
2. **The guard rails load before the skill does.** A host reads a skill body
   when it decides the task is relevant, which is the wrong moment for a
   child-safety rule: the first reply of a session can arrive before the body
   is ever opened. So the non-negotiables are also written to the host's
   always-on context file, and for a rules-only host such as Cursor the
   complete policy is inlined there, because it has nothing else to read.

   That last part is not a setting you can get wrong. A `rules` host has no
   file to reach for later, so the eight-line summary would otherwise be the
   whole of what the model ever sees — and eight lines is not a policy. The
   kind decides it, and an entry that asks for `inlineBody: false` on a rules
   host is refused at load.

No host is ever handed a shell, a file write, or a patch, whatever it calls
its tools. That list is checked against every generated frontmatter, and a
registry entry that asks for one is refused at load.

Conventions move: these hosts rename their directories and their tools between
releases. Where each fact came from is recorded beside the entry in
`adapters/harnesses.mjs`, and an entry can be overridden locally without
patching this repository — which is the point of the registry being open.

## Turn the auto-menu on

*This part is pi-only.* The other hosts have no extension mechanism this
package uses, so they get the guard rails and the skill and nothing else.

The extension is **off by default**, so the same files are safe on a parent's own
machine. Enable it only in the child's shell:

```bash
echo 'export PI_KID_EXPLORER=1' >> ~/.bashrc
```

Now every new pi session opens with the Quest Cards menu already dealt.

Without it, he starts a game by typing `/skill:kid-explorer` or just "let's play".

## Commands

| Command | Effect |
|---|---|
| `/quest` | Deal a fresh set of 4 cards. |
| `/wild` | One surprising true fact from any subject. |
| `/skill:kid-explorer` | Force-load the skill (useful if the model did not pick it). |

The last one is how pi names it. Other hosts spell it as in the table above —
`/kid-explorer` on Claude Code, Gemini CLI, OpenCode, Devin and the generic
install, `$kid-explorer` on Codex, `@kid-explorer` on Cursor.

Inside the chat he can also say: `start`, `menu`, `next`, `wild`, `more`,
`deeper`, `break`, or any topic at all. Those words work in every host, because
they are in the skill body and not in a command file.

## Layout

```
kid-explorer/
├── SKILL.md                           core rules, the game, the turn format
├── references/
│   ├── emotional-safety.md            the eight guarantees, what breaks the space, confidentiality
│   ├── content-policy.md             the age gate: allow list, deny list, escalation
│   ├── reframing.md                  Time Bridge table — war & disaster → constructive
│   ├── topic-bank.md                 the card deck, 60 cards across 4 suits
│   ├── situation-corner.md           social-situation coaching + situation bank
│   ├── comms-style.md                autism + ADHD style guide, with worked example
│   └── websearch-lens.md             the seven checks before any web content is shared
├── adapters/
│   ├── harnesses.mjs                 the registry: one entry per host, with its provenance
│   ├── registry.mjs                  loads, merges and validates every entry
│   ├── build.mjs                     the generator, and the verifier
│   └── harnesses/                    drop a host in here; README.md is the contract
├── extensions/
│   └── kid-explorer-autostart.ts     optional auto-menu + /quest and /wild (pi only)
├── test/
│   ├── run-all.sh                    the suite runner
│   ├── docker-test.sh                build + run hermetically in a container
│   ├── docker-harness.sh             installs for every host, one container each
│   ├── Dockerfile                    the test image (node base, unprivileged)
│   ├── lib/assert.sh                 assertion helpers
│   ├── harness/extension.harness.mjs drives the real extension under a stub pi API
│   ├── harness/legend.check.mjs      verifies the fixed symbol alphabet
│   ├── harness/harness.check.mjs     asks whether a host would find the installed files
│   ├── harness/registry.query.mjs    lets the suite read its expectations from the registry
│   ├── fixtures/harnesses/           an example of a host added from outside
│   ├── fixtures/harnesses-invalid/   specs written to be refused, one per rule
│   ├── harness/docs.claims.check.mjs checks the claims this file makes
│   └── [1-9]0-*.sh                   the ten suites
├── install.sh                        self-fetching installer
├── .github/workflows/test.yml        ci: node 22/24/26, an offline container run,
│                                     and an install per host, one container each
├── Makefile                          make test | make docker | make docker-harness | make dist
└── LICENSE                           MIT, with a note for grown-ups
```

Nothing under `build/` is kept by hand, and `build/` is git-ignored. A
generated copy of the safety policy sitting in the repository is a second text
somebody might edit alone, which is the thing this layout exists to prevent.

## Parent notes — please read

- This is a **conversation** skill. It reads no files, writes no files, and runs
  no commands. It is not a sandbox and not a substitute for supervision.
- The lens is a strong instruction to the model, not a hard technical filter. A
  determined child can still try to get past it, and models can still err. Keep
  the machine in a shared room and skim the sessions.
- The agent can search the web. It is told to inspect every result before sharing
  and to never print a URL or a raw result list. Still: if you want to be certain,
  turn the web tools off for the agent — in pi that is done in the tool allowlist,
  and the skill then answers from the model alone. Every generated adapter also
  withholds shell, file-write, and patch tools by name.
- The agent tells the child, plainly, what a grown-up can see, and never promises
  secrecy it cannot keep. It will not quote anything he told it about his feelings,
  family, body, school, or worries, and it writes no line at all rather than one that
  could get him in trouble. This is deliberate: a child who thinks he is being
  reported on will not speak. Your visibility of the *material* is preserved; the
  conversation is not a channel for reporting on him.
- Once per session the agent may add a line prefixed `📋 PARENT:` — a note for you
  about a fixation, a good question, or a topic it declined.
- If he ever reports distress, the skill is written to stop the game and tell him
  to go to you. Check that it does.

## Tune it

Everything is plain markdown. The three files most worth editing for your child:

- `references/topic-bank.md` — add the things he actually loves, delete what bores him.
- `references/reframing.md` — add a row for any new fixation that comes along.
- `references/comms-style.md` — adjust the word budget and the tone to what works.

Edit the one source. Re-run `make adapters` (or the installer) to push the change
out to every host; do not edit a generated file, because the next build will
overwrite it and the suite will report the difference. In pi, run `/reload` after
editing.

## Testing

The repo ships a test suite of ten suites. It is hermetic: no network, no model call, no
credentials, no host state. `node` must be new enough to strip TypeScript
types natively (>= 22.6).

```bash
make test            # the whole suite, on this machine
make lint            # structure, frontmatter, content lint, safety canaries
make docker          # build the image, run the suite offline in a container
make docker-live     # also installs pi, and checks that pi can load this package
make docker-isolated # one fresh container per suite, twice over
make docker-shell    # a shell inside the test image
make harnesses       # list the hosts this build can install for
make docker-harness  # install for every host, one container per host
make adapters        # generate the per-host adapters into build/
make verify-adapters # re-check what is in build/
```

Or without make:

```bash
test/run-all.sh                # everything
test/run-all.sh --only safety  # one suite
test/docker-test.sh            # build + run, --network none
test/docker-test.sh --live     # plus the pi load smoke test
test/docker-harness.sh         # every host, installed, in its own container
test/docker-harness.sh --list  # which hosts that would cover
```

| Suite | What it holds down |
|---|---|
| `10-structure` | Every file exists, every `references/…` link resolves, no orphans, the deck has its four suits and >= 40 cards, the bridge table is well formed, fences balance, no tabs, no CRLF. |
| `20-frontmatter` | The frontmatter parses, the name is spec-legal and matches its directory, the description is within 1024 chars and actually routes, and the tool allowlist grants the web tools while withholding `bash`, `edit` and `write`. |
| `30-content-lint` | No instructional-harm pattern anywhere in the shipped text, no URLs in child-facing files, no markup, no secrets, no shell. **And a meta-test: an injected canary must be caught, or the linter is declared dead.** |
| `40-safety-canaries` | The guard rails are still bolted on: every hard rule, the escalation script, the deny list, the seven checks, the bridge steps, the word budget, the one-question rule, the autism + ADHD contract, and the eight emotional-safety guarantees. Hazards are asserted twice over — once as *named and forbidden* in the prohibition tables, and once as *absent from practice* — so a removed guard cannot be quietly reintroduced. |
| `50-extension-loads` | Loads the real `.ts` under a stub pi API and drives it: the gate stays shut by default, opens only for the documented values, `/quest` deals a menu, `/quest` refuses politely while busy, `/wild` works, `session_start` auto-deals and stays quiet mid-answer. |
| `60-fresh-install` | Installs into a throwaway `PI_HOME`, byte-for-byte, from a clean checkout; `--skill` and `--no-ext`; bad options rejected; re-install is idempotent and keeps a backup; the real `~/.pi` is provably untouched; a package without `SKILL.md` is refused. |
| `70-pi-live` | Optional. Starts pi for real with a bad API key. If the run reaches the provider, nothing on the way in crashed. Read that claim narrowly, because it is narrower than it looks: a frontmatter no parser will accept does not crash, it is dropped, and pi drops it without a word. This suite was green on a skill that did not load. It remains worth running — it is the only thing that notices an extension that throws — but it is not proof of a load, and `71-skill-loads` is. |
| `71-skill-loads` | **Does the skill reach the model?** Asks pi, in its machine-readable mode, for the prompt it would have sent, and requires that this skill's name and description are in it — which is what pi's own documentation promises it puts there for every skill that loaded. Then it builds the twin that shipped, the one whose frontmatter no parser accepts, and requires that the twin is absent and that the two runs differ. Without that control the assertion above is a search for any text like ours: the first version of this probe was satisfied four times over by the working directory. |
| `80-portability` | Every host in the registry: it builds, it lands where the registry promises, its frontmatter stays inside the specification, it is granted no forbidden tool, the clauses survive in the artefact that is supposed to carry them, a second build is byte-identical, blocks neither duplicate nor nest, a host added from outside is accepted, six bad specs are each refused for the right reason, **and two meta-tests confirm the checks can still fail** — one by deleting a safety clause, one by hand-editing a body. |
| `90-docs` | Everything this file asserts about the program: the flags, the `make` targets, the layout tree, the suite table, the examples. It is the reason the paragraph above can be trusted a month from now. |

The container runs as an unprivileged user with capabilities dropped and no
new privileges, which is also how the child should run it.

### `test/docker-harness.sh` — one container per host

This is a different claim from the one `80-portability` makes, which is why it
is a separate run rather than a second set of assertions. `80` checks what the
generator emits into a scratch directory. This checks what the installer leaves
on a machine, in the directories the host really reads, from a home directory
that has never seen the skill, with no network, as an unprivileged user — and
it installs **twice**, because a parent re-runs an installer and that must not
lose anything the first run put there.

```bash
test/docker-harness.sh                        # every host
test/docker-harness.sh --harness cursor,generic
test/docker-harness.sh --repeat 2
KID_EXPLORER_HARNESS_DIR=./my-hosts test/docker-harness.sh   # and yours
```

The host list is read from the registry, so a host you add is covered the
moment you add it, with nothing here to update. Each run is a fresh container,
so *pristine* is a property of the harness rather than something this script
has to remember to clean up afterwards.

It proves that the files land where a host will look. It does not prove that
Claude Code, Codex, Cursor, Devin, Gemini CLI or OpenCode accept them — those
binaries are not present and cannot be fetched offline. That boundary is stated
rather than glossed over: the assertions are about this package's layout and
text against each host's documented conventions.

## Behavioural evaluation

The ten suites above say nothing about whether a model obeys the policy, because none of
them asks a model anything. They are joined by a tenth, opt-in harness that does. It is
separate on purpose: it needs a model, so it cannot run in the offline container, and a test
that quietly needs the internet is a test that fails on somebody's laptop.

```bash
make evals              # asks the model the probes, three arms, three samples each
make evals SAMPLES=5    # more samples, for a probe that is near the line
test/evals.sh --sandbox # the same, in a fresh pid/mount namespace with a copied HOME
```

Each probe is put to three arms, so that a pass can be attributed to something:

| Arm | What the model is given |
|---|---|
| `none` | nothing. The control. A probe the control passes is not testing the policy, and is reported as such |
| `rail` | the always-on guard rail alone — what a rules-only host would carry |
| `body` | the whole `SKILL.md` plus its references, which is what the child gets |

The result below is one run of eleven probes, three samples each, on the local model named
in the report. It is a measurement of that model on that day, not a property of the skill.

| Arm | Probes passing every sample |
|---|---|
| `none` | 1 / 11 |
| `rail` | 1 / 11 |
| `body` | 7 / 11 |

The gap between the last row and the first two is the case for shipping the whole policy
rather than a summary of it, and it is why a rules-only host is refused a configuration that
omits the body. The four probes `body` does not clear are reported, not smoothed over:
the model sometimes answers a topic request without asking its one question, and sometimes
states the odds of a feared event without reassuring the child about them.

Nothing about the child is committed. The harness writes transcripts to
`test/evals/results/`, which is git-ignored, and prints only aggregate counts. A
transcript holds a child's shape of asking and the model's words about frightening things;
neither is ours to publish, and a public repository of them would be a strange thing to
maintain.

The judge is itself tested, and that is not a flourish:

```bash
node test/evals/judge.selfcheck.mjs          # does the instrument mean what it says
node test/evals/judge.relaxations.check.mjs  # does every loosening still catch what it must
node test/evals/report.truth.check.mjs       # does the report show the reply it actually judged
```

The first asks whether the measurements do what they claim, on the shapes the policy itself
mandates — including that the policy asks for a question introduced by `❓` rather than by a
question mark, which a naive counter reads as no question at all. The second exists because
every rule that was loosened in order to stop the judge failing a correct refusal was paired
with a reply it must still fail; a rule that cannot fail anything is not a rule. The third
was written after the runner was found to print a compliant reply beside the failures of a
different sample, where a reader would conclude that a good reply had been failed for nothing.

## Licence

MIT. Use it, fork it, adapt it for your own kid.
