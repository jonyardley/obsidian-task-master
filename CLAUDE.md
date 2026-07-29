# Task Master: development guidelines

> Last reviewed: 2026-07-28.

## Read these first

Three documents, in this order. They are the authority; this file is the
working conventions on top of them.

1. [`DESIGN.md`](DESIGN.md) is the authority on **behaviour**. Approved. Do not
   relitigate the decisions in section 3.
2. [`PLAN.md`](PLAN.md) is the authority on **sequence**. Ten phases, each with
   a verification gate. Its "How to work through this" rules are binding.
3. [`HANDOVER.md`](HANDOVER.md) is the authority on **what has actually
   happened**. Update it when the state changes.

Both DESIGN.md and PLAN.md have been amended since approval. Every amendment is
marked in place with a date and a reason. Trust the current text.

## Project overview

An Obsidian plugin giving a single full-page view over every task in the vault,
grouped by tag lanes, with drag reordering, quick edits and a raw-line editor.
It replaces a stack of partly-overlapping community plugins that between them
still could not do the one thing needed: see all tasks at once, ordered by
hand, and edit them in place.

The target vault is `~/Documents/Obsidian/Red Badger`. It holds Jon's real work
notes. That fact drives most of the rules below.

## Project structure

```text
src/
  main.ts                  plugin entry: registerView, commands, ribbon, settings
  controller.ts            the only thing the view calls; owns Index, Store and
                           Writer, and later the one-deep undo record
  settings.ts              defaults and the seeded groups; the tab lands in phase 7
  model/                   pure. no Obsidian imports. all the tests live here.
    types.ts               Task, Segment, GroupDef, StoreData
    tokens.ts              the lexer: one reader per metadata token
    parse.ts               line -> Task
    serialise.ts           Task -> line
    mutate.ts              setStatus, setPriority, setDate; layout edits, refusable
    group.ts               lane assignment, multi-lane conflict resolution
    query.ts               the filter: tag matching, search, tag facets
    filter.ts              sorting and section assembly
    inline.ts              description -> text and link parts, for rendering
    paths.ts               excludedPaths matching, at a folder boundary
    summarise.ts           counts by status, tag and file, with subtag rollup
  data/                    the only place that touches the vault
    TaskIndex.ts           scan, incremental update, emit snapshots, refresh one file
    TaskWriter.ts          the five-step write path, per-file queue, stale abort
    Store.ts               data.json: defaults, repair, corrupt-file quarantine
  view/
    TaskMasterView.ts      ItemView shell, mounts the Svelte root
    App.svelte             toolbar, header, sections, empty states
    Toolbar.svelte         search, tag multi-select, any/all, sort, show done
    GroupSection.svelte    collapsible header, rows, Done date subheadings
    TaskRow.svelte         the two-line row, checkbox and quick-edit controls
    rowMenu.ts             the right-click menu; the only view file importing Menu
tests/
  fixtures/vault-corpus.txt   105 task lines, invented, see DESIGN.md 4.3
  corpus.ts                the fixture loader, used by every suite
  corpus.test.ts           guards the fixture itself
  fixtures.test.ts         grammar coverage of the fixture, content-agnostic
  roundtrip.test.ts        the corpus test, one assertion per line
  parse.test.ts            token semantics, plus composition cross-checks
  parse.robustness.test.ts fuzz over derived malformed input
  serialise.test.ts        canonical insertion order, whitespace on removal
  mutate.test.ts           each mutation, plus the corpus mutated and inverted
  group.test.ts            lane assignment and precedence
  query.test.ts            tag matching, search, tag facets
  filter.test.ts           sorting, filtering, section assembly, the Done cap
  inline.test.ts           description link splitting
  paths.test.ts            excludedPaths edge cases
  summarise.test.ts        counting and subtag rollup
  TaskIndex.test.ts        scan, incremental update, races, against a fake vault
  TaskWriter.test.ts       one line changed, refusals leave the file byte-identical
  Store.test.ts            seeding, repair, corrupt-file quarantine
  fakeVault.ts             the fake vault; obsidian-stub.ts the module alias
```

Full intended layout is DESIGN.md section 5.1. Modules not yet listed above do
not exist yet.

## Tech stack

TypeScript (pinned `~5.9.3`), Svelte 5, esbuild, Vitest 4, Obsidian API 1.13,
`@atlaskit/pragmatic-drag-and-drop`. No runtime dependencies beyond that one.

TypeScript stays on 5.x rather than 7.x deliberately: esbuild does the
transpiling, so `tsc` is only a type checker here, and svelte-check 4 makes no
claim about the native compiler. Revisit when svelte-check does.

## Commands

```bash
npm test                # Vitest, currently 789 tests, under a second
npm run test:watch      # the same, watching
npm run check           # tsc over src, tsc over tests, then svelte-check
npm run dev             # watch build, output lands in the vault via the symlink
npm run build           # check, then a minified production bundle
```

`npm run check` is three separate checks. All three must pass before a PR.

## Architecture non-negotiables

### The round-trip guarantee

For every task line in the vault, `serialise(parse(line)) === line`, byte for
byte. DESIGN.md section 4.3 calls this "the most important correctness property
in the system" and it is not an exaggeration: a parser that silently mangles a
line Jon wrote is worse than a parser that admits defeat.

How it is achieved: parsing decomposes a line into `Segment`s that **tile it
completely**, no gaps and no overlaps, so concatenating every segment's `text`
reproduces the input exactly. `serialiseTask` is therefore a concatenation, not
a canonical re-emission of tokens. Token order and inter-token whitespace stay
properties of the line rather than of the model.

Consequences you must respect:

- **Mutation works by editing `task.layout`**, never by rebuilding a line from
  the scalar fields. Do it that way and every mutation inherits the round-trip
  property for free: whatever you did not touch comes back byte for byte.
  Rebuild from scalars and you will silently reformat lines Jon reads daily.
- When a line does not round-trip, `roundTrips` is false. The task is still
  indexed and displayed, but every mutation is refused and the row offers only
  "open in file".
- If `roundtrip.test.ts` goes red, **stop and fix it before doing anything
  else.**

### Layer boundaries

| Layer | Responsibility | Depends on | Tested by |
| --- | --- | --- | --- |
| `model/` | parsing, serialising, ranking, filtering, grouping | nothing | Vitest, exhaustively |
| `data/` | vault reads, vault writes, persistence | Obsidian API, `model/` | Vitest against a fake vault, plus the manual gates |
| `view/` | render and emit intents. Never writes. | `controller.ts` | manual checklist |
| `controller.ts` | orchestrate: take an intent, mutate, write, refresh | `data/`, `model/` | manual checklist |

If a module in `model/` needs an Obsidian import, the boundary is wrong. Fix
the boundary rather than adding the import.

Files should stay small enough to hold in one head. Past roughly 250 lines is a
signal a file is doing two things. That signal is why the lexer was split out of
`parse.ts`.

### Index from the metadata cache, never a regex sweep

`TaskIndex` takes task lines from `ListItemCache` entries where
`task !== undefined`. That gets correct handling of code fences and nesting for
free. A regex sweep over file text does not, and will index tasks inside
fenced examples.

### Parser rules that are easy to break

- A token is only recognised at a whitespace boundary, as Obsidian Tasks does.
  `Task⏫` is prose.
- A glyph is never partially consumed. `📅 soon` is prose, not a broken date.
  Readers return null and the caller falls through to description text.
- Only links **after** a `🔗` are context links. A wikilink in the description
  stays in the description; that is how person pages keep matching.
- A trailing block ID is pulled off before the body scan, so it always
  serialises last and can never be mistaken for text.
- The description collapses whitespace. It is display and search text. `raw` is
  the source of truth for anything written back.
- `parseTaskLine` returns `Task | null` rather than throwing. Phase 8 needs it
  as the validator for the raw-line editor.

## The vault holds real notes

`~/Documents/Obsidian/Red Badger` is Jon's live work vault, not a fixture, and
nothing in this project backs it up. Versioning it is explicitly out of scope, so
the care has to live in the write path instead.

- **Exercise the write path against the scratch vault first.** PLAN.md rule 3. It
  exists now, at `~/Documents/Obsidian/Task Master Scratch`: 6 notes copied out of the
  live vault, its own git repository with a clean baseline, and its plugin folder
  symlinked to whichever worktree is doing the writing. Only write to the live vault
  once the scratch one behaves, and make the first live write a single task you can
  eyeball. Nothing from the scratch vault is ever committed here.
- **`TaskWriter` logs the before and after text of every line it changes**, so a
  surprising write is visible rather than inferred.
- **No mutation ever rewrites more than the single line it targets.** That is a
  success criterion in DESIGN.md section 2.3, not an aspiration.
- **Never edit `.obsidian/community-plugins.json` while Obsidian is running.**
  It gets clobbered. Enabling the plugin is Jon's action in the UI.

## Nothing from the real vault goes in this repository

The repository is public. The corpus fixture, the tag vocabulary in DESIGN.md and
every person or page name in the tests are **pseudonyms**, mapped consistently
across `DESIGN.md`, `PLAN.md` and `tests/`. Structure and counts are real; the
words are invented.

When adding a test case, invent the content. Do not paste a line out of the vault,
even as a quick reproduction, and do not put a real client, colleague, project or
Slack URL in a commit message or PR description either. If a real line is needed
to chase a parser bug, reproduce it locally and commit the transliterated
equivalent.

## Code style

- Strict TypeScript. `npm run check` must pass clean.
- Prefer well-established libraries over custom implementations.
- No new runtime dependencies without a reason stated in the PR.

### Comments

Default to **no comments**. Self-explanatory code with well-named identifiers
beats commented code. A reader who knows TypeScript and the Obsidian API should
answer "what does this do?" from the code alone.

A comment is justified ONLY in one of three buckets. Everything else gets
deleted.

1. **Section headers in a large file**, single-line dividers separating
   concerns, like `// ── token readers ──`. Never more than one line.
2. **Unusual things that need explaining**, a non-obvious WHY: a hidden
   constraint, a subtle invariant, a workaround for a specific bug, an Obsidian
   API quirk that would surprise a reader. Cite the reason concretely.
3. **Tactical code needing rework**, flagged and tied to a tracked issue:
   `// HACK(#N): …` or `// FIXME(#N): …`. A bare `// TODO come back to this`
   with no issue is not acceptable.

`///` doc comments get the same treatment. Do not write a comment that restates
what the code does, narrates self-evident structure, references the current PR,
or hedges without a tracked issue.

Two-line cap as a smell test: past two lines, ask whether it could be a
function name, a type, or an entry in this file. Usually yes.

## Testing

Automated tests cover `model/` exhaustively and `data/` for its orchestration.
`view/` and `controller.ts` are verified by the manual checklists in DESIGN.md
section 8.2 and the per-phase gates in PLAN.md.

`data/` is testable because `vitest.config.ts` aliases the `obsidian` module to
`tests/obsidian-stub.ts`. The real package ships types only, its `main` is the
empty string, so without the alias nothing under `src/data/` can be imported by a
test at all. `tests/fakeVault.ts` drives a vault the tests control. **Keep the stub
minimal**: the more of Obsidian it grows, the more the tests prove the stub rather
than the code. It can never show the cache contract was read correctly, only that
the code behaves given it, which is what the manual gates are still for.

**Write the test before the implementation for anything in `src/model/`.** That
layer is pure and is where all the risk lives. The suite runs in under a
second, so there is no excuse for red-green-refactor slipping to
"implement, then retrofit tests".

For `data/`, write the test that reproduces the interleaving you are worried about,
and **check it fails for the right reason first**. The mid-scan race in
`TaskIndex.test.ts` initially passed against broken code, because the fake read
returned the file's current content rather than its content when the read began.
An async test that cannot fail is worse than none.

The sixteen suites and what each is for:

- `roundtrip.test.ts` proves the round-trip guarantee. One assertion per corpus
  line so a failure names the line.
- `parse.test.ts` cross-checks the parse against the fixture's composition,
  stated rather than derived: 81 open, 24 done, 44 `#atlas*`, lanes 6/3/2/1, 70
  unlaned, one multi-lane task, both legacy block IDs. This is what stops
  round-tripping passing on a technicality, since tiling a line proves nothing
  about understanding it. The equivalent live-vault numbers are checked by grep
  at the phase 2 and 3 gates, not here.
- `fixtures.test.ts` asserts the fixture still exercises every construct the
  grammar admits, naming no tag, person or path. It is what lets the fixture be
  replaced without silently losing coverage, and it is why the corpus could be
  swapped for invented content in the first place. Extend it before extending
  the grammar.
- `parse.robustness.test.ts` fuzzes ~110k malformed inputs derived from the
  corpus. Invariants are only "never throws" and "never loses a byte". It ends
  with a guard asserting the suite did not pass vacuously, because its helper
  returns null both for "refused" and for "round-tripped". Keep that guard.
- `corpus.test.ts` guards the fixture itself.
- `paths.test.ts` and `summarise.test.ts` cover the two pure helpers `TaskIndex`
  leans on, which is how any of the indexing logic gets automated coverage at
  all.
- `group.test.ts` and `filter.test.ts` cover lane assignment and section
  assembly: which group a task lands in, how a multi-lane task is resolved, and
  the ordering rules in DESIGN.md section 4.5. The phase 3 gate is these two
  suites' numbers, read off the live vault.
- `query.test.ts` covers the toolbar's filter, table-driven: hierarchical tag
  matching at a segment boundary, any versus all, search across description and
  file path but not across tags or metadata, and the tag facets. `filter.test.ts`
  then filters the whole corpus, which is the phase 4 gate one higher, at 44
  rather than 43, because the corpus has no excluded path.
- `inline.test.ts` covers description link splitting, including a tiling
  assertion so a rendered row cannot silently lose a character.
- `Store.test.ts` covers `data.json`: seeding, repairing a partial file, and
  setting a corrupt one aside rather than overwriting it.
- `serialise.test.ts` and `mutate.test.ts` cover the mutations. `serialise.test.ts`
  is the two serialisation rules: where a token that was absent gets inserted, and
  what happens to the whitespace around one that is removed. `mutate.test.ts` is the
  semantics of each mutation, and then the mutation half of the round-trip guarantee:
  every corpus line set and restored, byte for byte, three ways over.
- `TaskWriter.test.ts` covers what the write path refuses. Exactly one line changes;
  a stale line, a declined mutation and a no-op all leave the file byte-identical; a
  block ID finds its line after the file has shifted; two writes to one file do not
  interleave. **Its queue test only fails against a writer with no queue because
  `FakeVault.process` yields between reading and storing.** Keep that yield.

**Run `npm test` before claiming anything complete, and paste the real output.**
"204 tests pass" from memory is not evidence. When skipping tests, say so in the
PR description with the reason.

## Toolchain gotchas

Each of these cost time to find. None is obvious.

- **`allowJs: true` is load bearing.** svelte-check resolves a `.svelte` import
  from a `.ts` file through a virtual JavaScript module and fails TS7016 without
  it. `tsc` alone passes either way, because Svelte ships an ambient
  `declare module '*.svelte'` that silently types it as `any`. Removing
  `allowJs` breaks `npm run check` only.
- **Two tsconfigs on purpose.** `tsconfig.json` covers `src/` with `"types": []`
  so no ambient Node types leak in: the plugin ships to mobile where there is no
  Node, and `model/` must stay pure. `tsconfig.tests.json` adds `node`.
- **The vault plugin folder is a symlink to this repo**, so a build lands live
  and Obsidian writes `data.json` into the repo root. It is gitignored. Work in
  the main checkout rather than a worktree, or `npm run dev` stops landing in
  the vault.
- **`css: 'injected'`** in `esbuild.config.mjs` is required: Obsidian loads a
  single `styles.css` and would silently drop a separate CSS output file.
- Vitest 4 has no `basic` reporter. Use `--reporter=verbose` or the JSON one.

## Workflow

Match ceremony to scope. Default to less.

### Tier 1, just do it

Typos, comment fixes, style tweaks, renames, dependency bumps, doc updates.
Make the change, verify, ship. Still a branch and a PR.

### Tier 2, default for phase work

Anything in `PLAN.md`. Follow the phase as written, write the model tests
first, pass the gate, then open the PR.

### Tier 3, needs a decision

Anything not covered by DESIGN.md. **Stop and ask.** Do not invent behaviour
and do not silently widen scope. PLAN.md rule 5. When the answer arrives,
record it in DESIGN.md as a dated amendment before implementing.

Changes to `model/parse.ts`, `model/serialise.ts` or `model/tokens.ts` go up at
least one tier regardless of size. The round-trip guarantee lives there.

### Always

1. **Never commit to `main`.** Branch, then PR.
2. **One commit per phase**, message `phase N: <title>`. The PR is per phase
   too, so a phase branch is normally one commit.
3. **Pass the phase gate before opening the PR.** A phase with an unpassed gate
   is not ready for review, even if the code is written. Say in the PR
   description which parts of the gate need Jon at the keyboard in Obsidian.
4. **Paste real command output in the PR description**, not assertions that
   something passes. `npm test` and `npm run check` at minimum.
5. **Self-review before requesting review.** Load
   `superpowers:requesting-code-review` for anything touching `model/` or any
   Tier 3 work, and post the summary as a `gh pr comment`, since findings raised
   in conversation are invisible to a later reader. Include "comment-policy
   violations are Blockers, not Nits" in the prompt.
6. **Open a tracked issue for every deferred or out-of-scope item.** PR
   descriptions are not tracking; they get collapsed after merge. Open the
   issues before posting the self-review comment, and end that comment with an
   explicit `Deferred items tracked: #N, #M` line, or
   `none, all flagged items addressed inline`. Silent omission is the failure
   mode.
7. **Squash merge.** Keep one commit per phase on `main`.

### After completing work

1. Update `HANDOVER.md`: phase table, what blocks the next agent, any decision
   taken since the design was approved.
2. Update `DESIGN.md` or `PLAN.md` if behaviour or sequence changed, marked in
   place with a date and a reason.
3. Update this file if a convention or gotcha changed.

### Skills

Opt in deliberately rather than letting everything auto-trigger.

- `superpowers:test-driven-development` for anything in `model/`. Required, not
  optional: PLAN.md rule 1 says the same thing.
- `superpowers:requesting-code-review` before any PR touching `model/`, and for
  all Tier 3 work. Run `superpowers:receiving-code-review` on the findings
  before acting on them.
- `superpowers:systematic-debugging` when a corpus line stops round-tripping and
  the cause is not immediately obvious.

Do not reach for `brainstorming`, `writing-plans` or `executing-plans`.
DESIGN.md and PLAN.md already are the brainstorm and the plan, and re-running
those skills invites relitigating settled decisions.

## Current state

See `HANDOVER.md` for the live picture. As of 2026-07-29:

- Phase 0 complete, gate passed. The plugin is enabled in the vault, loads with
  a clean console, and the ribbon icon opens a full-page tab reading "Task
  Master".
- Phase 1 complete, gate passed.
- Phase 2 complete, gate passed against the live vault: 80 open, 24 done, 104
  indexed.
- Phase 3, the read-only view, complete. The numeric half of its gate is verified
  against the live vault: Focus 3, Today 2, This week 6, Blocked 0, Unsorted 69,
  Done 24. Blocked reads 0 rather than the 1 the gate first stated; see the
  amendment in PLAN.md. The visual half needs Jon in Obsidian.
- Phase 4, filtering and search, complete and merged. Its gate is verified against the
  corpus, at 44 `#atlas*` rather than the live vault's 43; the live-vault half needs
  Jon in Obsidian.
- Phase 5, writes, complete. 789 tests green. **Both halves of its gate need Jon in
  Obsidian**, the scratch vault before the live one, and phase 6 must not start until
  they pass.
- Two vaults, two builds, on purpose: the live vault's plugin folder points at the main
  checkout, which is on `main` and therefore has no write path at all, and the scratch
  vault's points at the phase 5 worktree.
- The remote is public and history has been scrubbed and pushed. The local
  `backup/pre-scrub-*` refs still hold the original capture, so never
  `git push --all`. See HANDOVER.md.
- The corpus fixture was replaced with invented content on 2026-07-28 so the
  repository could be public. See DESIGN.md section 4.3.
