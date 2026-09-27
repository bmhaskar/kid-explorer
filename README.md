# Kid Explorer — a pi skill for a curious 12-year-old

A conversation skill for [pi](https://github.com/earendil-works/pi), written for a
bright 12-year-old on the autism spectrum with ADHD who loves history, geography,
animals, and botany.

It turns "what shall we talk about?" into a small card game, and puts a firm,
quiet **content lens** over everything the agent says — including anything it
pulls off the web.

## What it does

| | |
|---|---|
| **Quest Cards** | On session start the agent deals 4 topic cards — one History, one Geography, one Animals, one Botany. He picks a number, or names his own topic, or says `wild`. |
| **The lens** | Every answer passes seven checks before he sees it: age, violence, harm instructions, hate, fear, accuracy, privacy. Raw web results are never pasted. |
| **Time Bridge** | He is drawn to wars and catastrophes. The skill does not ban them — it bridges them. *"A world war from 1914 to 1918"* → then the whole turn on penicillin, radar, the jet engine, insulin, blood banks, and what the world built afterwards. |
| **Situation Corner** | Social-situation coaching. What happened, what each person felt, what the cues were, the exact words to say, one rule to keep. |
| **Progress** | Curiosity coins and a streak counter, awarded only for a real answer or a real question. |

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

The installer is self-fetching: run it from anywhere, even piped with no
checkout present, and it pulls the upstream archive and installs from that.
It verifies the package is complete before writing anything, refuses loudly
if it is not, and leaves the previous install as a timestamped backup.

### From a clone

```bash
git clone https://github.com/bmhaskar/kid-explorer.git
cd kid-explorer
./install.sh            # skill + the optional auto-menu extension
./install.sh --skill    # skill only, no extension
```

### By hand

```
~/.pi/agent/skills/kid-explorer/                 the skill
~/.pi/agent/extensions/kid-explorer-autostart.ts  optional, auto-deals the menu
```

Then restart pi, or run `/reload` inside a running session.

### Installer flags

| Flag | Effect |
|---|---|
| `--skill`, `--no-ext` | Install the skill only, without the extension. |
| `--from URL` | Install a specific archive tarball instead of the default upstream. |
| `--repo OWNER/NAME` | Upstream to fetch from (default `bmhaskar/kid-explorer`). |
| `--branch NAME` | Branch to fetch (default `main`). |
| `--offline` | Never touch the network. If there is no local checkout, refuse. |
| `--help` | Usage. Works even when the script was piped. |

`PI_HOME` is honoured, so you can trial an install anywhere:

```bash
PI_HOME=/tmp/trial ./install.sh && find /tmp/trial -type f
```

## Turn the auto-menu on

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

Inside the chat he can also say: `start`, `menu`, `next`, `wild`, `more`,
`deeper`, `break`, or any topic at all.

## Layout

```
kid-explorer/
├── SKILL.md                           core rules, the game, the turn format
├── references/
│   ├── content-policy.md              the age gate: allow list, deny list, escalation
│   ├── reframing.md                   Time Bridge table — war & disaster → constructive
│   ├── topic-bank.md                  the card deck, 60 cards across 4 suits
│   ├── situation-corner.md            social-situation coaching + situation bank
│   ├── comms-style.md                 autism + ADHD style guide, with worked example
│   └── websearch-lens.md              the seven checks before any web content is shared
├── extensions/
│   └── kid-explorer-autostart.ts      optional auto-menu + /quest and /wild
├── test/
│   ├── run-all.sh                     the suite runner
│   ├── docker-test.sh                 build + run hermetically in a container
│   ├── Dockerfile                     the test image (node base, unprivileged)
│   ├── lib/assert.sh                  assertion helpers
│   ├── harness/extension.harness.mjs  drives the real extension under a stub pi API
│   ├── harness/legend.check.mjs       verifies the fixed symbol alphabet
│   └── [1-7]0-*.sh                    the seven suites
├── install.sh                         self-fetching installer
├── .github/workflows/test.yml         ci: node 22/24/26, plus an offline container run
├── Makefile                           make test | make docker | make dist
└── LICENSE                            MIT, with a note for grown-ups
```

## Parent notes — please read

- This is a **conversation** skill. It reads no files, writes no files, and runs
  no commands. It is not a sandbox and not a substitute for supervision.
- The lens is a strong instruction to the model, not a hard technical filter. A
  determined child can still try to get past it, and models can still err. Keep
  the machine in a shared room and skim the sessions.
- The agent can search the web. It is told to inspect every result before sharing
  and to never print a URL or a raw result list. Still: if you want to be certain,
  run pi with the web tools disabled and it will answer from the model alone.
- Once per session the agent may add a line prefixed `📋 PARENT:` — a note for you
  about a fixation, a good question, or a topic it declined.
- If he ever reports distress, the skill is written to stop the game and tell him
  to go to you. Check that it does.

## Tune it

Everything is plain markdown. The three files most worth editing for your child:

- `references/topic-bank.md` — add the things he actually loves, delete what bores him.
- `references/reframing.md` — add a row for any new fixation that comes along.
- `references/comms-style.md` — adjust the word budget and the tone to what works.

Run `/reload` in pi after editing.

## Testing

The repo ships a test suite. It is hermetic: no network, no model call, no
credentials, no host state. `node` must be new enough to strip TypeScript
types natively (>= 22.6).

```bash
make test            # the whole suite, on this machine
make lint            # structure, frontmatter, content lint, safety canaries
make docker          # build the image, run the suite offline in a container
make docker-live     # also installs pi, and checks that pi can load this package
make docker-isolated # one fresh container per suite, twice over
make docker-shell    # a shell inside the test image
```

Or without make:

```bash
test/run-all.sh                # everything
test/run-all.sh --only safety  # one suite
test/docker-test.sh            # build + run, --network none
test/docker-test.sh --live     # plus the pi load smoke test
```

| Suite | What it holds down |
|---|---|
| `10-structure` | Every file exists, every `references/…` link resolves, no orphans, the deck has its four suits and >= 40 cards, the bridge table is well formed, fences balance, no tabs, no CRLF. |
| `20-frontmatter` | The frontmatter parses, the name is spec-legal and matches its directory, the description is within 1024 chars and actually routes, and the tool allowlist grants the web tools while withholding `bash`, `edit` and `write`. |
| `30-content-lint` | No instructional-harm pattern anywhere in the shipped text, no URLs in child-facing files, no markup, no secrets, no shell. **And a meta-test: an injected canary must be caught, or the linter is declared dead.** |
| `40-safety-canaries` | The guard rails are still bolted on: every hard rule, the escalation script, the "never promise secrecy" clause, the deny list, the seven checks, the bridge steps, the word budget, the one-question rule, the autism + ADHD contract. |
| `50-extension-loads` | Loads the real `.ts` under a stub pi API and drives it: the gate stays shut by default, opens only for the documented values, `/quest` deals a menu, `/quest` refuses politely while busy, `/wild` works, `session_start` auto-deals and stays quiet mid-answer. |
| `60-fresh-install` | Installs into a throwaway `PI_HOME`, byte-for-byte, from a clean checkout; `--skill` and `--no-ext`; bad options rejected; re-install is idempotent and keeps a backup; the real `~/.pi` is provably untouched; a package without `SKILL.md` is refused. |
| `70-pi-live` | Optional. Starts pi for real with a bad API key. If the run reaches the provider, startup — including this skill and extension — completed cleanly. It also feeds the loader a deliberately malformed skill and requires a complaint, so the "no load-time error" assertions cannot pass vacuously. |

The container runs as an unprivileged user with capabilities dropped and no
new privileges, which is also how the child should run it.

## Licence

MIT. Use it, fork it, adapt it for your own kid.
