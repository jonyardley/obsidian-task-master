# Handover

For an agent picking up Task Master with no prior context. Written 2026-07-28 after
phase 3, updated 2026-07-29 after phase 5.

## Read these first, in this order

1. `DESIGN.md` — the authority on behaviour. Approved. Do not relitigate the
   decisions in section 3.
2. `PLAN.md` — the authority on sequence. Ten phases, each with a verification
   gate. Its "How to work through this" rules are binding, especially rule 3
   (a scratch vault before the live one, and check what the live vault's files did
   afterwards) and rule 5 (stop and ask rather than inventing behaviour).
3. This file, for what has actually happened.

Both documents have been amended since they were approved. Every amendment is
marked in place with a date and a reason. Trust the current text.

## State

PRs #1, #9 and #10 are merged, so `main` carries phases 0 to 4. Phase 5 is on branch
`claude/obsidian-task-master-phase-5-c1982b`.

| Phase | Status |
| --- | --- |
| 0, scaffold | Complete, gate passed 2026-07-28. |
| 1, parse and serialise | Complete, gate passed. |
| 2, indexing | Complete, gate passed 2026-07-28. |
| 3, read-only view | Complete, merged. Numeric gate verified against the live vault; the visual half needs Jon in Obsidian. |
| 4, filtering and search | Complete, merged. Gate verified against the corpus; the live-vault half needs Jon in Obsidian. |
| 5, writes | Complete, 789 tests green. Automated half done; **both halves of its gate need Jon in Obsidian**, scratch vault first. |
| 6 onwards | Not started. |

Two vaults now, pointing at two builds, which is what lets the live one stay on
read-only code until the write path has been exercised somewhere disposable:

| Vault | Plugin folder symlinks to | Build it holds |
| --- | --- | --- |
| `~/Documents/Obsidian/Red Badger`, the live one | the main checkout | `main`, phases 0 to 4, no write path at all |
| `~/Documents/Obsidian/Task Master Scratch` | the phase 5 worktree | phase 5, the first build that can write |

The scratch vault is 6 notes copied out of the live one, 94 task lines, with its own
git repository and a clean baseline commit, so `git diff` there is a real check. It is
outside this repository and nothing in it is ever committed here.

```
src/
  main.ts                  plugin entry, ribbon, commands, the dev dump command
  controller.ts            owns Index, Store and Writer; hands the view a snapshot
  settings.ts              defaults and the four seeded groups
  view/
    TaskMasterView.ts      ItemView shell, mounts the Svelte root
    App.svelte             toolbar, header, sections, empty states
    Toolbar.svelte         search, tag multi-select, any/all, sort, show done
    GroupSection.svelte    collapsible header, rows, Done date subheadings
    TaskRow.svelte         the two-line row, checkbox and quick-edit controls
    rowMenu.ts             the right-click menu; the only view file importing Menu
  model/
    types.ts               Task, Segment, GroupDef, StoreData
    tokens.ts              the lexer: one reader per metadata token
    parse.ts               line -> Task
    serialise.ts           Task -> line
    mutate.ts              setStatus, setPriority, setDate, all pure, all refusable
    group.ts               lane assignment, multi-lane conflict resolution
    query.ts               the filter: tag matching, search, tag facets
    filter.ts              sorting and section assembly
    inline.ts              description -> text and link parts, for rendering
    paths.ts               excludedPaths matching, at a folder boundary
    summarise.ts           counts by status, tag and file, with subtag rollup
  data/
    TaskIndex.ts           scan, incremental update, emit, refresh one file
    TaskWriter.ts          the five-step write path, per-file queue, stale abort
    Store.ts               data.json: defaults, repair, corrupt-file quarantine
tests/
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
  fakeVault.ts             a vault the tests drive
  obsidian-stub.ts         stands in for the obsidian module, aliased in vitest
```

## What blocks you right now

**Phase 6 must not start until the phase 5 gate has passed in Obsidian.** Phase 6
writes block IDs into notes, so it inherits everything phase 5's gate is checking, and
PLAN.md's opening rule is that a phase does not start before the previous gate passes.

Three things need Jon at the keyboard, in this order:

1. The phase 5 gate, in the scratch vault, then in the live vault. Both halves are
   written out under the phase 5 gate in PLAN.md. The scratch vault has a git baseline,
   so `git diff` there answers the "exactly one line changed" question directly.
2. The visual half of the phase 3 gate, in the live vault. Open the view beside the
   current Daily Note's `## Focus` block, check the three Focus tasks read the same,
   then toggle light and dark and all three CSS snippets off and on.
3. The live-vault half of the phase 4 gate. Filter to `atlas` and confirm 43 open
   tasks, switch to `all` with `atlas` plus `focus`, search "handover", and confirm
   no markdown file in the vault has been modified. There is no git repository in
   the vault to diff, so that last check is a `find -newermt`; see the second
   amendment to rule 3 in PLAN.md.

Items 2 and 3 are already deployable: the live vault's plugin folder points at the main
checkout, which is on `main` and built.

**If you are working in a git worktree, `npm run dev` does not reach the live vault.**
The plugin folder in `~/Documents/Obsidian/Red Badger/.obsidian/plugins/` is a symlink
to the main checkout, so a build from a worktree lands nowhere Obsidian looks for the
live vault. The scratch vault is the other way round: its plugin folder points at the
phase 5 worktree, deliberately, so that a build from there lands in the disposable
vault and not in Jon's notes.

Two things to know before you touch git or the remote:

1. **`backup/pre-scrub-main` and `backup/pre-scrub-build` hold the original
   verbatim capture of Jon's vault**, complete with client and colleague names.
   They are local-only and `origin` is clean, verified commit by commit. **Never
   `git push --all` or `--mirror` in this repository**, and delete or bundle those
   refs once you are confident the scrub is right.
2. **Read "Nothing from the real vault goes in this repository" in CLAUDE.md
   before adding a test case or writing a commit message.** The remote is public.

Phase 2's gate passed against the live vault on 2026-07-28: 80 open, 24 done, 104
indexed across 5 files, and an edit to a Daily Note reindexed that file without a
reload. 80 rather than the 81 that `grep` reports, because `excludedPaths` drops
the illustrative task in `Settings/_Vault Guide.md`. Every open-task figure in
DESIGN.md and in PLAN.md below phase 2 is a vault count and reads one lower in the
view; the phase 3 and 4 gates carry the adjusted numbers.

## Decisions taken since the design was approved

Recorded so you neither relitigate them nor mistake them for accidents.

- **D7, in DESIGN.md section 3 and 6.8.** Lane-assignment hotkeys and a one-deep
  undo, both added to phase 9. Rationale: on day one Unsorted holds ~70 of 81
  open tasks and the only route out was dragging one row at a time, and a
  mis-drop rewrites a tag in a file that is not open in an editor, so Obsidian's
  own undo cannot reach it. Jon approved as "1a 2a".
- **`ContextLink` gained a `kind` discriminator.** Six corpus lines carry
  markdown external links inside the `🔗` run, and line 58 mixes one with a
  wikilink. Section 4.1 said wikilinks only. Section 6.7 already styled external
  links, so this was read as an omission in the data model, not a decision to
  exclude them. DESIGN.md sections 4.1 and 4.2 amended.
- **`parseTaskLine` returns `Task | null`** rather than throwing. Phase 8 needs
  it as the validator for the raw-line editor.
- **TypeScript pinned to `~5.9.3`, not 7.x.** esbuild does the transpiling, so
  tsc is only a type checker here, and svelte-check 4 makes no claim about the
  native compiler. Revisit when svelte-check does.
- **The lexer was split out of `parse.ts`** at 370 lines, past the 250-line
  signal in DESIGN.md section 5.2.
- **`data/` is in the automated suite now**, amended in DESIGN.md section 8.1 with
  Jon's agreement. Confining Vitest to `model/` was right while `data/` was empty.
  A read-only review of `TaskIndex` found five defects, and a sixth, a scan
  overwriting a newer incremental result with stale text, was found by the first
  test written against it and could not have been found by reading. The mechanism
  is `tests/obsidian-stub.ts`, aliased in `vitest.config.ts` because the real
  `obsidian` package ships types only. **Keep that stub minimal**: the more of
  Obsidian it grows, the more the tests prove the stub.
- **Blocked renders 0, not 1.** The phase 3 gate stated Focus 3, Today 2, This
  week 6, Blocked 1, Unsorted 69, and noted its own figures summed to one more
  than the indexed open tasks. They are tag counts, so the single multi-lane task
  is counted under both lanes. Group order resolves it to This week, whose 6
  already includes it, leaving Blocked empty. Amended in place in PLAN.md phase 3
  and DESIGN.md section 6.2. If Jon would rather blocked work surfaced on its own,
  that is a group reorder in phase 7, not a grouping change.
- **`Store` landed in phase 3, not phase 4**, which is where the FIXME in
  `main.ts` had guessed. `TaskIndex` now reads `excludedPaths` from the persisted
  settings, closing issue #3.
- **Nested task rendering is still open**, issue #8, and **phase 5 did not take it
  either**. Phase 3 deferred it to phase 4 on the grounds that its breadcrumb needs
  filtering to exist; filtering exists now, so it is unblocked, but it is row rendering
  rather than writing, it needs a parent lookup over every task rather than the visible
  ones, a recursive row and its own gate, and nothing in phase 5 or 6 depends on it.
  Recommended home is phase 9 polish, which is where the rest of the row's rendering
  work sits. **Still a call for Jon**, and a cheap one to reverse either way.
- **The corpus fixture is invented, and the vault git baseline was dropped**,
  both on 2026-07-28 when the GitHub remote was added. The repository is public
  and the vault holds client detail, colleague names and personal notes, so the
  fixture was transliterated line for line: structure, glyphs, link shapes and
  every composition count preserved, words replaced. Pseudonyms are consistent
  across DESIGN.md, PLAN.md and `tests/`. Separately, Jon ruled a git baseline
  inside his vault out of scope for this project, so PLAN.md rule 3 now requires
  a scratch vault plus before/after logging in `TaskWriter` instead. Both are
  amended in place in DESIGN.md section 4.3 and PLAN.md rule 3.
- **The filter went into `model/query.ts`**, not into `filter.ts` as DESIGN.md
  section 5.1 and PLAN.md phase 4 both said. `filter.ts` was already at the 250-line
  signal with sorting and assembly alone. Same split, and same reason, as the lexer
  coming out of `parse.ts`. Amended in place in both documents.
- **Five things DESIGN.md section 6.4 left open**, all amended in place there: the
  filter applies to the Done section too; a filtered count reads as "n of m" on
  every group header and in the view total; tag matching folds case and the
  multi-select offers ancestors no task carries on its own; the sort selector
  overrides `Settings.fallbackSort` for the session rather than changing the setting;
  and the toolbar carries a clear-filter control, since a tag selection can be
  narrowed to nothing by an edit elsewhere in the vault.
- **`Toolbar.svelte` imports `debounce` from `obsidian`**, the first `.svelte` file
  to import the module at all. Deliberate rather than drift: the alternative is
  debouncing inside the controller, and that breaks the guard that stops an unrelated
  snapshot landing mid-debounce from wiping half-typed text. The controller would
  have to hold the pending term to keep the guard working, which is view state in the
  wrong layer. `debounce` is a pure helper with no vault access, so no boundary in
  DESIGN.md section 5.2 moves.
- **The show-done toggle drives the Done section's collapse state**, the same state
  the Done header toggles, rather than a second flag beside it. Section 6.4 defines
  it as "toggles the Done section between collapsed and expanded", and two controls
  over one thing must not be able to disagree. That state is persisted, so unlike the
  rest of the toolbar it survives a view close; that is the existing phase 3
  behaviour, not something phase 4 chose.
- **Every gate below phase 5 asks for an empty vault `git diff`**, which the rule 3
  amendment made unrunnable: there is no git repository in the vault. Read those
  lines as "no markdown file in the vault has been modified" and check with
  `find -newermt`. Amended in place under PLAN.md rule 3.

Phase 5 added these.

- **The write path verifies the target line twice**, once before the mutation and
  again inside the `vault.process` callback. DESIGN.md section 5.4 described one check,
  between the read and the write, which leaves a window for Sync or Jon's own typing to
  land in. `process` is the only place the check and the replacement cannot be
  separated. Amended in place in section 5.4.
- **A mutation reparses the line it produced, and refuses if the parse does not come
  back byte-identical.** That is what makes every mutation inherit the round-trip
  guarantee rather than restate it: `mutate.ts` edits `layout`, serialises, reparses,
  and returns null if anything is off. A null propagates as a refusal all the way to a
  `Notice`, and nothing is written.
- **Canonical insertion has two anchors, not one.** DESIGN.md 4.3 rule 2 gives the
  order; the subtlety is that a real line need not already be in it. A new token goes
  immediately after the last token it should follow, then before the first token it
  should precede. `#atlas 📅 2026-07-20` gaining a done date therefore lands at the end
  of the line, which is what Obsidian Tasks does and what the vault's completed lines
  look like; anchoring only on the first later token would put `✅` in front of the
  `📅` it must follow.
- **The context menu is flat, and the row's two new controls hide when unset.** Both
  amended in place in DESIGN.md section 6.3, with the reasons: `MenuItem` has no public
  `setSubmenu` in the 1.13 typings, and a metadata line carrying seventy visible
  buttons would fight section 6.7. Clearing a due date is a menu action for the same
  reason.
- **`TaskIndex` gained a public `refresh(path)`**, which is what the stale-read abort
  calls. Obsidian will not fire a `changed` event for a file the plugin has decided not
  to write, so without it the view would keep showing the line it just refused.
- **The priority control cycles normal → highest → high → medium → low → lowest.** The
  direct-set path is the menu now and the `1`-`5` hotkeys in phase 9; the cycle is for
  the one-click case.
- **`Task.raw` never carries a carriage return.** `TaskIndex` strips a trailing `\r`
  before parsing and `TaskWriter` puts it back on the line it writes, so a CRLF file
  stays a CRLF file. Without that the `\r` becomes part of the last description word,
  and a token appended after it lands mid-line and costs the line its `\r\n`. No file
  in either vault has CR bytes today, checked with `grep -rlU $'\r'`; one arriving
  through Sync from Windows would. Found by the self-review, fixed with a test at both
  levels.
- **`FakeVault.process` snapshots the text and then yields before storing.** Real
  `vault.process` is atomic, but the race the per-file queue exists to prevent is
  between one write's verify and another's write. Without the yield the queue test
  passes against a writer that has no queue, which is the failure mode CLAUDE.md warns
  about: an async test that cannot fail is worse than none. Checked by deleting the
  queue and watching that one test go red.

## How parsing works, because the rest depends on it

The one idea worth loading before you touch `model/`.

Parsing decomposes a line into `Segment`s that **tile it completely** — no gaps,
no overlaps. Concatenating every segment's `text` reproduces the input exactly,
so `serialiseTask` is a concatenation rather than a canonical re-emission of
tokens. Token order and inter-token whitespace therefore stay properties of the
line rather than of the model, which is what DESIGN.md section 4.3 rule 1
requires.

**Mutation works by editing `task.layout`**, not by rebuilding a line from the scalar
fields. Do it that way and every mutation inherits the round-trip property for free:
whatever you did not touch comes back byte for byte. Rebuild from scalars instead and
you will silently reformat lines Jon reads every day. `mutate.ts` is the worked
example, and the corpus suite at the end of `mutate.test.ts` is what holds it to it.

Other things worth knowing before you edit the parser:

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

## The test suite, and what each part is for

`npm test` — 789 tests, under a second.

- `roundtrip.test.ts` is the one DESIGN.md calls "the most important correctness
  property in the system". One assertion per corpus line so a failure names the
  line. **If you break this, stop and fix it before doing anything else.**
- `parse.test.ts` ends with a suite cross-checking the parse against the
  fixture's composition, stated rather than derived: 81 open, 24 done, 44
  `#atlas*`, lanes 6/3/2/1, 70 unlaned, one multi-lane task, both legacy block
  IDs. This is what stops round-tripping from passing on a technicality — tiling
  a line proves nothing about understanding it. The equivalent numbers for the
  live vault are checked by grep at the phase 2 and 3 gates instead, since they
  drift as soon as Jon ticks a box.
- `fixtures.test.ts` asserts the fixture still exercises every construct the
  grammar admits, naming no tag, person or path. It is what made replacing the
  corpus with invented content safe. Extend it before extending the grammar.
- `parse.robustness.test.ts` fuzzes ~110k malformed inputs derived from the
  corpus. Invariants are only "never throws" and "never loses a byte"; it makes
  no claim that mangled input is understood. It ends with a guard asserting the
  suite did not pass vacuously, because its helper returns null both for
  "refused" and for "round-tripped". Keep that guard.
- `filter.test.ts` ends with a suite filtering the whole corpus, which is the phase
  4 gate one higher: 44 `#atlas*` rather than the live vault's 43, because the
  corpus has no excluded path. It was checked red before green, by dropping the
  hierarchical half of tag matching: that reads 9 rather than 44, since only 9 of
  the corpus's open `#atlas*` lines carry the bare parent tag.
- `mutate.test.ts` ends with the mutation half of the round-trip guarantee: every
  corpus line has its priority set and restored, its due date set and restored, and
  is completed and uncompleted, and each must come back byte for byte. That is 300 of
  the suite's assertions and the reason the count jumped. Lines carrying the same
  token twice are skipped, with their own cases above, because setting a token and
  putting it back cannot restore two glyphs from one.
- `TaskWriter.test.ts` is about what does *not* happen: a stale line is refused with
  the file untouched, a mutation that declines writes nothing, a no-op writes nothing,
  and a write logs its before and after so PLAN.md rule 3 has its record.

## Toolchain gotchas

Each of these cost time to find. None is obvious.

- **`allowJs: true` is load bearing.** svelte-check resolves a `.svelte` import
  from a `.ts` file through a virtual JavaScript module and fails TS7016 without
  it. `tsc` alone passes either way, because Svelte ships an ambient
  `declare module '*.svelte'` that silently types it as `any`. Removing
  `allowJs` breaks `npm run check` only.
- **Two tsconfigs on purpose.** `tsconfig.json` covers `src/` with `"types": []`
  so no ambient Node types leak in — the plugin ships to mobile where there is
  no Node, and `model/` must stay pure. `tsconfig.tests.json` adds `node`.
  `npm run check` runs both plus svelte-check.
- **The vault plugin folder is a symlink to this repo**, so a build lands live
  and Obsidian writes `data.json` into the repo root. It is gitignored.
- **`css: 'injected'`** in `esbuild.config.mjs` is required: Obsidian loads a
  single `styles.css` and would silently drop a separate CSS output file.
- Vitest 4 has no `basic` reporter. Use `--reporter=verbose` or the JSON one.

## Commands

```bash
npm test                # 789 tests
npm run check           # tsc over src, tsc over tests, svelte-check
npm run dev             # watch build, output lands in the vault via the symlink
npm run build           # check, then a minified production bundle
```

## Start here

1. Get the phase 5 gate run, scratch vault first. Until it passes, phase 6 has not
   started, whatever the code looks like.
2. Then phase 6, manual ordering, per PLAN.md. `rank.ts` is pure and gets tests first;
   block-ID assignment goes into `TaskWriter`, which already has the queue and the
   stale-read abort it needs.
3. Commit one commit per phase, message `phase N: <title>`, and paste real test
   output rather than asserting that something passes.
