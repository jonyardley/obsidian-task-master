# Handover

For an agent picking up Task Master with no prior context. Written 2026-07-28,
after phase 1.

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

Branch `build/task-master`, three commits ahead of `main`, working tree clean.

| Phase | Status |
| --- | --- |
| 0, scaffold | Code complete. **Gate not fully passed**, see below. |
| 1, parse and serialise | Complete, gate passed. 236 tests green. |
| 2 onwards | Not started. |

```
src/
  main.ts                  plugin entry, ribbon, command, activateView
  view/
    TaskMasterView.ts      ItemView shell, mounts the Svelte root
    App.svelte             placeholder, renders "Task Master"
  model/
    types.ts               Task, Segment, GroupDef, StoreData
    tokens.ts              the lexer: one reader per metadata token
    parse.ts               line -> Task
    serialise.ts           Task -> line
tests/
  corpus.ts                the fixture loader, used by every suite
  corpus.test.ts           guards the fixture itself
  fixtures.test.ts         grammar coverage of the fixture, content-agnostic
  roundtrip.test.ts        the corpus test, one assertion per line
  parse.test.ts            token semantics, plus composition cross-checks
  parse.robustness.test.ts fuzz over derived malformed input
```

## What blocks you right now

One thing is waiting on Jon. **Do not work around it.**

1. **The phase 0 gate is unverified.** Obsidian was running, so
   `community-plugins.json` was deliberately left alone: editing it under a
   running Obsidian gets clobbered. `grep -c task-master` on that file still
   returns 0, so the plugin has never been loaded. Nobody has yet confirmed it
   opens without console errors. Jon needs to enable **Task Master** in Settings
   → Community plugins and click the ribbon icon.

Phase 2's gate also needs Obsidian running with the plugin enabled, so it is
blocked behind it.

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

`npm test` — 236 tests, under a second.

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
npm test                # 236 tests
npm run check           # tsc over src, tsc over tests, svelte-check
npm run dev             # watch build, output lands in the vault via the symlink
npm run build           # check, then a minified production bundle
```

## Start here

1. Ask Jon to clear the blocker above. Until the plugin loads, phase 2 cannot be
   gated.
2. Then phase 2, indexing, per PLAN.md. `TaskIndex.ts` takes task lines from
   `ListItemCache` entries where `task !== undefined`, which gets correct
   handling of code fences and nesting for free — do not sweep with a regex.
3. Commit one commit per phase, message `phase N: <title>`, and paste real test
   output rather than asserting that something passes.
