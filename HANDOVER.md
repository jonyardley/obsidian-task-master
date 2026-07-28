# Handover

For an agent picking up Task Master with no prior context. Written 2026-07-28,
after phase 3.

## Read these first, in this order

1. `DESIGN.md` — the authority on behaviour. Approved. Do not relitigate the
   decisions in section 3.
2. `PLAN.md` — the authority on sequence. Ten phases, each with a verification
   gate. Its "How to work through this" rules are binding, especially rule 3
   (`git diff` the vault after anything that writes) and rule 5 (stop and ask
   rather than inventing behaviour).
3. This file, for what has actually happened.

Both documents have been amended since they were approved. Every amendment is
marked in place with a date and a reason. Trust the current text.

## State

PR #1, phases 0 to 2, is merged. Phase 3 is PR #9, on branch
`claude/obsidian-task-master-phase-3-12f9ef`, carrying a self-review as a comment.

| Phase | Status |
| --- | --- |
| 0, scaffold | Complete, gate passed 2026-07-28. |
| 1, parse and serialise | Complete, gate passed. |
| 2, indexing | Complete, gate passed 2026-07-28. |
| 3, read-only view | Complete, 361 tests green. Numeric gate verified against the live vault; the visual half needs Jon in Obsidian. |
| 4 onwards | Not started. |

```
src/
  main.ts                  plugin entry, ribbon, commands, the dev dump command
  controller.ts            owns Index and Store, hands the view a snapshot
  settings.ts              defaults and the four seeded groups
  view/
    TaskMasterView.ts      ItemView shell, mounts the Svelte root
    App.svelte             header, sections, empty state
    GroupSection.svelte    collapsible header, rows, Done date subheadings
    TaskRow.svelte         the two-line row
  model/
    types.ts               Task, Segment, GroupDef, StoreData
    tokens.ts              the lexer: one reader per metadata token
    parse.ts               line -> Task
    serialise.ts           Task -> line
    group.ts               lane assignment, multi-lane conflict resolution
    filter.ts              sorting and section assembly
    inline.ts              description -> text and link parts, for rendering
    paths.ts               excludedPaths matching, at a folder boundary
    summarise.ts           counts by status, tag and file, with subtag rollup
  data/
    TaskIndex.ts           scan, incremental update, emit
    Store.ts               data.json: defaults, repair, corrupt-file quarantine
tests/
  corpus.ts                the fixture loader, used by every suite
  corpus.test.ts           guards the fixture itself
  fixtures.test.ts         grammar coverage of the fixture, content-agnostic
  roundtrip.test.ts        the corpus test, one assertion per line
  parse.test.ts            token semantics, plus composition cross-checks
  parse.robustness.test.ts fuzz over derived malformed input
  group.test.ts            lane assignment and precedence
  filter.test.ts           sorting, section assembly, the Done cap
  inline.test.ts           description link splitting
  paths.test.ts            excludedPaths edge cases
  summarise.test.ts        counting and subtag rollup
  TaskIndex.test.ts        scan, incremental update, races, against a fake vault
  Store.test.ts            seeding, repair, corrupt-file quarantine
  fakeVault.ts             a vault the tests drive
  obsidian-stub.ts         stands in for the obsidian module, aliased in vitest
```

## What blocks you right now

Nothing blocks the code. Phase 4, filtering and search, is next per PLAN.md.

One thing needs Jon at the keyboard: the visual half of the phase 3 gate. Open the
view beside the current Daily Note's `## Focus` block, check the three Focus tasks
read the same, then toggle light and dark and all three CSS snippets off and on.

**If you are working in a git worktree, `npm run dev` does not reach the vault.**
The plugin folder in `~/Documents/Obsidian/Red Badger/.obsidian/plugins/` is a
symlink to the main checkout, so a build from a worktree lands nowhere Obsidian
looks. Build in the main checkout for anything that needs eyes on it in Obsidian.

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
- **Nested task rendering is deferred to phase 4**, tracked as issue #8. DESIGN.md
  section 6.3 wants a child indented under its parent and a breadcrumb when only
  the child matches a filter; the breadcrumb half is meaningless before filtering
  exists, and PLAN.md's phase 3 task list does not mention nesting.
- **The corpus fixture is invented, and the vault git baseline was dropped**,
  both on 2026-07-28 when the GitHub remote was added. The repository is public
  and the vault holds client detail, colleague names and personal notes, so the
  fixture was transliterated line for line: structure, glyphs, link shapes and
  every composition count preserved, words replaced. Pseudonyms are consistent
  across DESIGN.md, PLAN.md and `tests/`. Separately, Jon ruled a git baseline
  inside his vault out of scope for this project, so PLAN.md rule 3 now requires
  a scratch vault plus before/after logging in `TaskWriter` instead. Both are
  amended in place in DESIGN.md section 4.3 and PLAN.md rule 3.

## How parsing works, because the rest depends on it

The one idea worth loading before you touch `model/`.

Parsing decomposes a line into `Segment`s that **tile it completely** — no gaps,
no overlaps. Concatenating every segment's `text` reproduces the input exactly,
so `serialiseTask` is a concatenation rather than a canonical re-emission of
tokens. Token order and inter-token whitespace therefore stay properties of the
line rather than of the model, which is what DESIGN.md section 4.3 rule 1
requires.

**Mutation in phase 5 must work by editing `task.layout`**, not by rebuilding a
line from the scalar fields. Do it that way and every mutation inherits the
round-trip property for free: whatever you did not touch comes back byte for
byte. Rebuild from scalars instead and you will silently reformat lines Jon reads
every day.

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

`npm test` — 361 tests, under a second.

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
npm test                # 276 tests
npm run check           # tsc over src, tsc over tests, svelte-check
npm run dev             # watch build, output lands in the vault via the symlink
npm run build           # check, then a minified production bundle
```

## Start here

1. Phase 4, filtering and search, per PLAN.md. `filter.ts` already assembles the
   sections and sorts them; phase 4 adds the tag filter, the search and
   `Toolbar.svelte` in front of it.
2. Read the phase 4 gate first: it expects 43 `#atlas*` tasks, not the 44 in
   DESIGN.md section 1.1, for the same exclusion reason as phase 3.
3. Commit one commit per phase, message `phase N: <title>`, and paste real test
   output rather than asserting that something passes.
