# Task Master: implementation plan

Companion to [DESIGN.md](DESIGN.md). Read that first. It is the authority on
behaviour; this document is the authority on sequence.

Audience: an implementing agent with no prior context on this project.

---

## How to work through this

Ten phases. Each is small, independently verifiable, and leaves the plugin in a
working state. Do not start a phase before the previous phase's verification
gate passes.

Rules that hold for every phase:

1. **Write the test before the implementation** for anything in `src/model/`.
   That layer is pure and is where all the risk lives.
2. **Run `npm test` before claiming a phase complete.** Paste the output. Do not
   assert that something passes without having seen it pass.
3. **Verify every vault write against a scratch vault before the live one.**
   *Amended 2026-07-28. The original rule required `git init` inside
   `~/Documents/Obsidian/Red Badger` before phase 5. Jon ruled that out of
   scope: versioning his notes is not this plugin's job. The safety it bought has
   to come from somewhere, so it comes from here instead.* Before phase 5, copy a
   representative handful of notes into a scratch vault, point Obsidian at that,
   and exercise the write path there. `TaskWriter` must log the before and after
   text of every line it changes so a surprising write is visible rather than
   inferred. Only once the scratch vault behaves does the live vault get written
   to, and the first live write is a single task you can eyeball. **Do not skip
   this.** These are Jon's real notes and this project does not back them up.
4. **Commit at each gate**, one commit per phase, message `phase N: <title>`.
5. If a phase turns out to need a decision not covered in DESIGN.md, stop and
   ask. Do not invent behaviour and do not silently widen scope.

Target vault for all manual verification: `~/Documents/Obsidian/Red Badger`.
Expected counts as of 2026-07-28: 53 markdown files, 81 open tasks, 24 done.

---

## Phase 0: scaffold

**Goal:** an empty full-page view opens in Obsidian, with a working watch build.

Tasks:

1. `npm init`. Dependencies: `obsidian` (dev), `typescript`, `esbuild`,
   `svelte@5`, `esbuild-svelte`, `@atlaskit/pragmatic-drag-and-drop`, `vitest`,
   `@tsconfig/svelte`.
2. `manifest.json`: id `obsidian-task-master`, name `Task Master`, `minAppVersion`
   `1.5.0`, `isDesktopOnly` false.
3. `esbuild.config.mjs` following the official `obsidian-sample-plugin` config,
   with `esbuild-svelte` added and `obsidian` plus all CodeMirror packages
   external. Bundle to `main.js` at the repo root.
4. `src/main.ts`: `registerView('task-master-view', leaf => new TaskMasterView(leaf))`,
   a ribbon icon, and the command `Task Master: open task view`. Use the standard
   `activateView` pattern from the Obsidian docs, but open in the main editor
   area with `workspace.getLeaf(false)` rather than a sidebar leaf.
5. `src/view/TaskMasterView.ts`: an `ItemView` that mounts an `App.svelte`
   rendering the single word "Task Master". Unmount in `onClose`.
6. A dev symlink or copy step putting the build output into
   `~/Documents/Obsidian/Red Badger/.obsidian/plugins/obsidian-task-master/`.
   Add `hot-reload` if convenient.
7. `.gitignore`: `node_modules`, `main.js`, `*.js.map`.

**Gate:** the plugin loads in Obsidian with no console errors, the ribbon icon
opens a full-page tab reading "Task Master", `npm run dev` rebuilds on save.

---

## Phase 1: the model, parse and serialise

**Goal:** every task line in the vault round-trips byte for byte.

This is the highest-risk phase and the one that most benefits from going slowly.

Tasks:

1. `src/model/types.ts`: transcribe the interfaces from DESIGN.md section 4.2
   and 4.4 verbatim. No invention.
2. `tests/roundtrip.test.ts` **first**. Read
   `tests/fixtures/vault-corpus.txt`, which already exists and holds all 105
   real task lines. Emit one `it()` per line so a failure names the line.
   Expect it to fail wholesale.
3. `src/model/parse.ts`. Parse to the `Task` shape. Record the byte offset of
   every metadata token as you go: serialisation rebuilds by substitution, not
   by re-emitting in canonical order. See DESIGN.md section 4.3 rule 1, which is
   the thing that makes round-tripping possible at all.
4. `src/model/serialise.ts`. Rebuild the line from the recorded offsets. Set
   `roundTrips` by comparing against `raw`.
5. Iterate until all 105 lines pass.
6. `tests/parse.test.ts`: hand-written cases for each token type, both observed
   metadata orderings, every status character from DESIGN.md section 4.1, an
   empty description, a description containing a bare `#` that is not a tag, a
   description containing an inline wikilink, and a `🔗` run with two links
   separated by ` · `.

Watch out for:

- Priority and date emoji are multi-byte. Use code points, not byte indices, and
  be consistent about it. JavaScript string indices are UTF-16 code units, which
  is fine as long as nothing mixes in `Buffer` offsets.
- `#atlas/` appears once in the tag scan of the vault, a trailing slash. Parse it
  without crashing.
- Some lines are numbered, `- [ ] 10. Get canonical Log Analytics KQL query…`.
  The `10.` is description text, not a list marker.
- Some tasks have both a domain tag and a lane tag, and tags appear both before
  and after the `🔗` run.

**Gate:** `npm test` green. All 105 corpus lines round-trip. Paste the output.

---

## Phase 2: indexing

**Goal:** the plugin knows about every task in the vault and keeps up with edits.

Tasks:

1. `src/data/TaskIndex.ts`. Initial scan per DESIGN.md section 5.3: metadata
   cache for `listItems` and `headings`, `vault.cachedRead` for text. Take task
   lines from `ListItemCache` where `task !== undefined`, so code fences and
   non-task list items are excluded for free.
2. Attach `blockId` from `ListItemCache.id`, `parentLine` from
   `ListItemCache.parent`, `section` from the nearest preceding heading.
3. Incremental handlers for `metadataCache.on('changed')`, `vault.on('delete')`,
   `vault.on('rename')`, all via `this.registerEvent`. Track the first
   `metadataCache.on('resolved')` and expose an `isFullyIndexed` flag.
4. Path exclusion from settings, defaulting to `Settings` and `Templates`.
5. A temporary dev command `Task Master: dump index stats` logging counts by
   status, by tag, and by file.

**Gate:** the dump reports **80 open and 24 done**. Cross-check with:

```bash
grep -rh '^\s*- \[ \]' ~/Documents/Obsidian/Red\ Badger --include=*.md | wc -l
```

*Amended 2026-07-28. That grep returns 81, not 80, and the gate originally
expected the dump to match it. The difference is one line: an illustrative
`- [ ] Verb-led task title` inside `Settings/_Vault Guide.md`, which the default
`excludedPaths` correctly drops. The grep has no notion of exclusions, so 81 by
grep and 80 indexed is the pass condition, not a bug. If the two ever agree,
the exclusions have stopped working.*

Then edit a task in a Daily Note and confirm the index updates without a
reload.

---

## Phase 3: read-only view

**Goal:** the view looks like the reference screenshot.

Tasks:

1. `src/model/group.ts`: assign tasks to groups from lane tags. Virtual Unsorted
   and Done groups. Multi-lane conflict resolution, first match in group order.
   Test it.
2. `src/model/filter.ts`: sort and section assembly, no filtering yet. Ranked
   tasks first by rank, unranked after by fallback sort. Test it.
3. `src/data/Store.ts`: `loadData`/`saveData`, defaults, the four seeded groups
   from DESIGN.md section 4.4, corrupt-file handling.
4. `src/controller.ts`: owns Index and Store, exposes a reactive snapshot to the
   view. The view calls the controller and nothing else.
5. `GroupSection.svelte` and `TaskRow.svelte`. Two-line row layout. Collapse
   state persisted to `GroupDef.collapsed`.
6. Done section, collapsed, grouped by done date descending, capped at 50.
7. `styles.css`, scoped under `.task-master-view`, implementing the table in
   DESIGN.md section 6.7. Render tags as `a.tag` so `colored-tags` colours carry
   through. Render description wikilinks as working internal links.

**Gate:** counts must read Focus 3, Today 2, This week 6, Blocked 1, Unsorted 69,
Done 24. Note that 3 + 2 + 6 + 1 + 69 = 81, one more than the 80 indexed open
tasks, because one task in `Inbox.md` carries both `#blocked` and `#this-week`. It
must appear in exactly one group, resolved by group order, not both.

*Amended 2026-07-28, following the phase 2 gate. Every open-task figure in this
plan below the phase 2 gate is a vault count and reads one lower in the view,
because `excludedPaths` drops the illustrative task in `Settings/_Vault Guide.md`.
That task is unlaned, so the minus one lands entirely on Unsorted: 70 in the vault,
69 in the view.*

*Amended 2026-07-28, during phase 3. **Blocked reads 0, not 1**, and This week
reads 6. The figures above are tag counts, which is why they sum to 81: the one
multi-lane task is counted under both of its lanes. In the view it appears once,
resolved by group order, and the seeded order in DESIGN.md section 4.4 puts This
week (order 2) before Blocked (order 3), so This week is where it lands and its 6
already includes it. The pass condition is Focus 3, Today 2, This week 6, Blocked
0, Unsorted 69, Done 24, summing to exactly the 80 indexed open tasks. If Jon
would rather blocked work surfaced in its own lane, that is a group reorder in
phase 7, not a grouping change.*

*Also, the "`git diff` on the vault must be empty" step no longer applies: rule 3
above dropped the vault git baseline as out of scope. Phase 3 cannot write anyway,
since `TaskWriter` does not exist until phase 5 and the controller holds no write
path. Collapse state goes to `data.json`, which is inside the plugin folder and not
a note.*

Then open the view beside the current Daily Note's `## Focus` block. The three
Focus tasks appear with the same content and a visibly similar treatment.
Toggle Obsidian between light and dark, and toggle all three CSS snippets off,
confirming the view stays legible in all four combinations. No writes have
happened yet, so `git diff` on the vault must be empty.

---

## Phase 4: filtering and search

**Goal:** narrow to one project without losing sight of the overall shape.

Tasks:

1. Extend `filter.ts`: tag filtering with hierarchical prefix matching, any/all
   toggle, case-insensitive substring search over description and file path.
   Test each, table-driven.
2. `Toolbar.svelte`: search input debounced 120 ms, tag multi-select ordered by
   frequency, any/all toggle, sort selector, show-done toggle.
3. Group sections stay visible when filtered, showing filtered counts.
4. Filter state in memory only, reset on view close.

**Gate:** filtering to `atlas` shows all 43 `#atlas*` tasks, including both
subtags. 43 rather than the 44 in DESIGN.md section 1.1: the excluded
`Settings/_Vault Guide.md` example carries the parent tag. See the phase 3 gate.
Switching to `all` with `atlas` plus `focus` selected narrows correctly.
Searching "handover" matches by description and by file path. Vault `git diff`
still empty.

---

## Phase 5: writes

**Goal:** complete, uncomplete, set priority, set due date. Single-line diffs.

**Before starting, snapshot the vault.** See rule 3 above.

Tasks:

1. `src/model/mutate.ts`: `setStatus`, `setPriority`, `setDate`, all pure, all
   tested. Canonical insertion order per DESIGN.md section 4.3 rule 2.
2. `src/data/TaskWriter.ts`: the five-step write path from DESIGN.md section 5.4,
   including block-ID re-resolution, the stale-read abort with its `Notice`, and
   the per-file promise queue.
3. Wire the row checkbox, a priority cycle control, and a due-date picker.
4. Right-click context menu: complete, priority, set due date, open in file,
   copy task text.
5. Disable every mutation on tasks where `roundTrips` is false, and render the
   muted warning glyph with its tooltip.

**Gate:** complete a task from the view, then `git diff` the vault. Exactly one
line in one file changed, gaining ` ✅ 2026-…`. Uncomplete it and confirm the
line returns to its original bytes. Set a priority on a task that has none, then
clear it, and confirm the line returns to its original bytes. Confirm the Focus
query block in the Daily Note reflects the completion.

---

## Phase 6: manual ordering

**Goal:** drag to reorder within a group, and it survives a restart.

Tasks:

1. `src/model/rank.ts`: sparse ranks in steps of 1024, midpoint insertion,
   head insertion, renormalisation when a gap drops below 2. Property test per
   DESIGN.md section 8.1.
2. Block-ID assignment in `TaskWriter`: append ` ^tm-<base36>`, collision check
   against all known block IDs first, retry up to five times. Called only
   immediately before a task's first rank is written. Adopt an existing block ID
   if the line already has one, including the non-prefixed ones left behind by
   Task List Kanban.
3. `src/view/dnd.ts`: `pragmatic-drag-and-drop` wiring. Handle-only dragging,
   propagation stopped on the handle. Drop indicator as a 2 px line. Drag
   disabled where `roundTrips` is false.
4. Persist ranks to `data.json` on drop.
5. Order GC in `Store.ts`, gated on `TaskIndex.isFullyIndexed`.

**Gate:** reorder five tasks in Focus. Quit Obsidian completely, reopen, confirm
the order held. `git diff` the vault: only the reordered lines changed, each
gaining a `^tm-` suffix and nothing else. Confirm the block IDs are invisible in
the Daily Note thanks to the existing `.cm-blockid` rule. Reorder enough times in
one gap to force a renormalisation and confirm order is preserved.

---

## Phase 7: groups

**Goal:** drag between lanes, and create lanes.

Tasks:

1. `mutate.ts`: `setLaneTag`, removing the current lane tag and adding the
   target. Moving into Unsorted removes the lane tag. Tested.
2. Cross-group drag: write the tag first, then the rank. If the tag write fails,
   write no rank.
3. Dropping onto a collapsed group header appends to that group.
4. Settings tab: create, rename, reorder and delete groups. Deleting a group
   never edits a file; its tasks fall into Unsorted and keep their tag.
5. Warning glyph on tasks carrying two or more lane tags.

**Gate:** drag a task from Focus to This week. `git diff` shows one line, with
`#focus` replaced by `#this-week`. Confirm the Daily Note `## Focus` query block
no longer lists it. Create a group "Waiting on" with tag `waiting`, drag a task
into it, confirm the tag is written and the task appears there after a restart.

Multi-lane case, using the real one in `Inbox.md` rather than a synthetic fixture:

```
- [ ] [[Ada Fenwick]]: review for Beacon & Wren ⏫ 📅 2026-07-03 #crew #blocked #this-week
```

It must render in exactly one group, carry the warning glyph naming both lane
tags, and dragging it to Today must remove **both** `#blocked` and `#this-week`
and add `#today`, leaving `#crew` untouched. Leave the line as it is in the
vault afterwards; it is the only real example of this case.

---

## Phase 8: inline editing

**Goal:** edit any part of a task without leaving the view.

Tasks:

1. `mutate.ts`: `setBody`, replacing everything between the checkbox and the
   block ID. Tested.
2. `TaskEditor.svelte`: click the description to swap it for a single-line input
   holding the raw line body. Enter commits, Escape cancels, blur commits.
3. Validate on commit by reparsing. If the result does not parse, keep the editor
   open and show an inline error. Never write an unparseable line.
4. Clicking a link in the description follows the link and does not open the
   editor.

**Gate:** edit a task's text, its tag and its due date in one go through the raw
editor. `git diff` shows one line, changed exactly as typed, with the block ID
still in place. Confirm a deliberately malformed edit is refused rather than
written.

---

## Phase 9: polish

Tasks:

1. Empty states: no tasks in the vault, no tasks matching the filter, an empty
   group.
2. `src/view/keyboard.ts`: the bindings in DESIGN.md section 6.8, registered on
   the view container so they never leak into the editor. Selection movement with
   `j`/`k`, `x` to toggle complete, `e` to edit, `1`-`5` for priority, `/` to
   focus search, `Escape` to clear.
3. **Lane hotkeys**, per decision D7. `g` then a group key moves the selection to
   that group, `g` then `u` moves it to Unsorted. Derive the key from the group
   label's first letter, resolve collisions by group order, show the key in the
   group header. Advance the selection afterwards, so working down Unsorted is
   one repeated keystroke. Test the key-derivation function.
4. **One-deep undo** in `controller.ts`, per decision D7 and DESIGN.md section
   6.8. Record file, block ID or line, and previous raw line for the last write
   only. Undo re-runs the phase 5 write path so the stale-read check still
   applies. A cross-group drag undoes tag and rank together. Bind `Cmd+Z` in the
   view, clear the record on view close, never persist it.
5. Nested task rendering, including the muted parent breadcrumb when only a child
   matches the filter.
6. Mobile sanity: the view must render and not crash. It need not be pleasant.
7. `README.md`: what it does, how to install from source, the task format it
   expects, and the fact that markdown remains the source of truth.
8. Remove the phase 2 dev command.
9. **Update `Settings/_Vault Guide.md` in the vault.** Two passages are now false:
   the "No drag ordering: priority markers plus `sort by priority` do the
   ranking" line under "Writing a task", and the `Actions.md` bullet under
   "Folders" describing it as the master kanban board to drag in. Replace both
   with a short description of this view, and update the "Daily flow" step 5 which
   points at `Actions.md`. Show Jon the diff rather than committing it silently:
   it is his own documentation.

**Gate:** triage ten tasks out of Unsorted using only the keyboard, then undo the
last one and confirm the line returns to its original bytes. Then work a real
planning session in the view for twenty minutes, `git diff` the vault, and read
every changed line.

---

## Reference

Verified against current documentation on 2026-07-28.

### Obsidian API

- `Plugin.registerView(type, viewCreator)`, then `leaf.setViewState({ type, active: true })`
  and `workspace.revealLeaf(leaf)`. Reuse an existing leaf via
  `workspace.getLeavesOfType(type)`.
- `Vault.process(file, fn, options?): Promise<string>`. Atomically reads,
  applies `fn` synchronously, writes back. This is the correct API for
  single-line edits. Do not use `vault.modify`, which is not atomic against
  concurrent edits.
- `MetadataCache.getFileCache(file).listItems?: ListItemCache[]`, where
  `ListItemCache` gives:
  - `task?: string`, a single character. `' '` means incomplete, any other
    character means complete, `undefined` means not a task.
  - `id?: string`, the block ID of the list item if one is defined.
  - `parent: number`, the line number of the parent list item, or the negative of
    the first list item's line number at root level.
  - `position: Pos`, inherited from `CacheItem`.
- `MetadataCache.on('changed', file)` fires when a file has been reindexed. It
  does **not** fire on rename; use `vault.on('rename')` for that.
- `MetadataCache.on('resolved')` fires when initial indexing completes.

### Obsidian Tasks emoji format

Priority: `🔺` highest, `⏫` high, `🔼` medium, absent normal, `🔽` low,
`⏬` lowest.

Dates: `➕` created, `🛫` start, `⏳` scheduled, `📅` due, `✅` done,
`❌` cancelled. All `YYYY-MM-DD`.

Other: `🔁` recurrence, `🆔` id, `⛔` depends on.

`🔗` is Jon's own convention, not part of Obsidian Tasks.

### Vault facts

| Fact | Value |
| --- | --- |
| Path | `~/Documents/Obsidian/Red Badger` |
| Files | 53 markdown, excluding `.obsidian` |
| Open tasks | 81 |
| Done tasks | 24 |
| Corpus fixture | `tests/fixtures/vault-corpus.txt`, 105 lines |
| Lane tags, open tasks | `this-week` 6, `focus` 3, `today` 2, `blocked` 1 |
| Open tasks with no lane | 70 of 81 |
| Open tasks with two lanes | 1, in `Inbox.md` |
| Open `#atlas*` tasks | 44 |
| Existing query blocks | `Projects/*.md`, `People/*.md`, `Daily Notes/*.md` |
| Kanban board to retire | `Actions.md` |
| CSS to match | `.obsidian/snippets/tasks-readable.css` |
| Conventions to respect and update | `Settings/_Vault Guide.md` |
| Skill spec, read at run time | `Settings/plan-my-day.md` |
| Tasks in `Meetings/` | none, plain bullets only, so not indexed |
