# Task Master: design

An Obsidian plugin giving Jon Yardley a single full-page view over every task in
his vault, so actions captured anywhere can be planned, consolidated and
prioritised in one place.

Status: approved design, ready for implementation.
Date: 2026-07-28.
Companion document: [PLAN.md](PLAN.md).

---

## 1. Context

### 1.1 The vault this is built for

Target vault: `~/Documents/Obsidian/Red Badger`. Measured on 2026-07-28.

*Amended 2026-07-28. This repository is public, so every domain tag, page name
and person below is a pseudonym, mapped consistently here, in PLAN.md and in
`tests/fixtures/vault-corpus.txt`. The counts, the structure and the conventions
are the real ones; only the words changed. Lane tags (`#focus`, `#today`,
`#this-week`, `#blocked`) are unchanged, because they are configuration this
plugin reads rather than anything identifying.*

| Metric | Value |
| --- | --- |
| Markdown files (excluding `.obsidian`) | 53 |
| Open tasks | 81 |
| Completed tasks | 24 |
| Folders | `Daily Notes/`, `Meetings/`, `People/`, `Projects/`, `Settings/`, `Templates/` |

Relevant installed plugins: `obsidian-tasks-plugin`, `task-list-kanban`,
`task-board`, `calendar`, `colored-tags`, `obsidian-minimal-settings`,
`obsidian-style-settings`, `reorderable`, `obsidian-outliner`.

Relevant CSS snippets: `tasks-readable.css` (213 lines, the look in the
reference screenshot), `task-card-zoned-footer.css`, `kanban-minimal.css`.

Tag usage. The occurrence column counts every appearance anywhere in the vault,
including inside query blocks and prose, so it runs well ahead of the task
counts. The lane column counts **open tasks** actually carrying the tag.

| Tag | Occurrences | Open tasks | Role |
| --- | --- | --- | --- |
| `#crew` | 47 | | domain |
| `#atlas/migration` | 24 | | domain |
| `#atlas` | 24 | | domain |
| `#studio` | 20 | | domain |
| `#atlas/docs` | 20 | | domain |
| `#focus` | 13 | 3 | lane |
| `#blocked` | 8 | 1 | lane |
| `#home` | 7 | | domain |
| `#this-week` | 6 | 6 | lane |
| `#beacon` | 5 | | domain |
| `#today` | 2 | 2 | lane |

Open tasks carrying `#atlas` or one of its subtags: 44.

So the vault already distinguishes **domain** tags (what the task is about)
from **lane** tags (when Jon intends to do it). That distinction is load
bearing for this design.

Only 11 of the 81 open tasks carry any lane tag at all, and 7 of those 11 sit in
`Inbox.md` as residue from the Todoist import. **Roughly 70 open tasks currently
have no planning lane whatsoever.** That is the problem this plugin exists to
solve, and it is also why the first run has to be useful before Jon has dragged
anything.

Exactly one open task carries two lane tags, in `Inbox.md`:

```
- [ ] [[Ada Fenwick]]: reviews for Beacon & Wren ⏫ 📅 2026-07-03 #crew #blocked #this-week
```

Keep it as a test case rather than tidying it up. Multi-lane conflict handling
needs a real example.

### 1.1.1 Documented conventions

`Settings/_Vault Guide.md` is Jon's own written record of how the vault works.
Treat it as authoritative on intent. The parts that bear on this design:

- Capture goes into the daily note as it happens, tagged. Nothing is filed by
  hand. Queries gather it. **This plugin consolidates and prioritises; it does
  not become a capture surface.** That is the reasoning behind the non-goal in
  section 2.2.
- `#focus` is "today's short list, 1 to 3 items, cuts across every
  column/project, pulled into the daily note's `## Focus` query".
- `#blocked` is "anything stuck, kept under a project's `## Later`".
- Sub-initiative tags nest under the parent (`#atlas/migration`) precisely so they
  roll up into `tag includes #atlas`. Hierarchical prefix matching in the filter
  is therefore matching an intentional convention, not a convenience.
- `Meetings/` notes hold "a plain reference list of every action (not live
  tasks)". Verified: zero checkbox tasks under `Meetings/`. So meeting notes will
  not appear in this view, correctly, and no de-duplication logic is needed.
- Person pages are matched by full-name wikilink, which is why descriptions must
  keep inline wikilinks intact rather than stripping them to plain text.

Two statements in the guide are **superseded by this plugin** and must be
rewritten when it lands, see section 9:

> No drag ordering: priority markers plus `sort by priority` do the ranking.

> `Actions.md` the master Kanban board (Task List Kanban plugin), scoped to the
> whole vault. Drag to prioritise here.

`#today` and `#this-week` are not documented in the guide. They arrived with the
Todoist import and the `Actions.md` kanban columns. Their inclusion as default
groups is a judgement call, recorded as such in section 4.4.

### 1.2 What exists already and why it is not enough

Per-project notes each carry an Obsidian Tasks query block of the form:

```tasks
not done
tag includes #atlas/migration
sort by priority
hide edit button
hide postpone button
```

These work well for reading a single project. They cannot reorder, cannot
consolidate across projects into planning lanes, and cannot be edited in place.

`Actions.md` holds a Task List Kanban board with columns Later, This week,
Today, Pending, matched by column name, `columnOrderMode: manual`,
`manualOrder: {}`. The manual order is empty. That plugin pins order by writing
Obsidian block IDs into task lines, which is why `tasks-readable.css` ends with
a rule hiding `.cm-blockid`. The board has effectively been abandoned.

Tasks are written into the vault by hand and by the `plan-my-day` skill, which
pulls Krisp meeting actions, saved Slack messages and starred Gmail threads into
Daily Notes, Meetings, Projects and People notes. **Anything this plugin does to
task syntax must stay compatible with that skill.**

### 1.3 The actual gap

Durable manual ordering across a consolidated, filterable, editable view, in the
visual language Jon already built. That is the whole product.

---

## 2. Goals and non-goals

### 2.1 Goals

1. One full-page view listing every task in the vault.
2. Filter by tag, including hierarchical prefix matching, plus free-text search.
3. Completed tasks moved into a collapsed section.
4. Manual reprioritisation by drag, persisted across restarts.
5. Grouping into planning lanes, with the ability to create lanes.
6. Visual continuity with the existing Tasks-query rendering.
7. Editing in place: status, priority, due date, lane, and the task text itself.
8. Keyboard-first triage of the Unsorted queue, and undo of the last change.

### 2.2 Non-goals

Explicitly out of scope. Each of these is a plausible next step, and none of
them belongs in v1.

- Replacing the per-project `tasks` query blocks. They stay.
- Recurrence logic. `🔁` rules are parsed, preserved verbatim, and never
  interpreted or advanced. Obsidian Tasks keeps that job.
- Task dependencies. `🆔` and `⛔` are preserved verbatim, not surfaced.
- Subtask management. Nested tasks are displayed nested under their parent when
  the parent is visible, but cannot be re-parented.
- Saved views, calendar views, kanban columns, timeline views.
- Mobile-optimised layout. The view must not crash on mobile; it need not be
  pleasant there.
- Sync, multi-vault, or multi-device order reconciliation.
- Creating tasks from the view. Capture stays in Daily Notes and `plan-my-day`.
  Consolidation is what this view is for.

### 2.3 Success criteria

- Every one of the 105 task lines in `tests/fixtures/vault-corpus.txt`
  round-trips through parse then serialise byte for byte.
- Reordering tasks, quitting Obsidian, and reopening preserves the order.
- Moving a task from Focus to This week rewrites the lane tag on the line, and
  the `#focus` query block in the current Daily Note reflects the change.
- No mutation ever rewrites more than the single line it targets.
- The view renders 105 tasks with no perceptible delay, and a full index
  completes in under 100 ms.

---

## 3. Decisions taken, with reasoning

Recorded so the implementing agent does not relitigate them.

### D1. Vertical grouped list, not kanban columns

Collapsible sections stacked vertically, drag to reorder within and between
sections.

Rationale: the design Jon already likes and reads daily is a list. Columns were
tried twice and abandoned. A vertical list also gives task text room to breathe,
which matters because his task descriptions are long sentences, not short
labels. Rejected: kanban columns; a toggle between both, as unnecessary surface
for a single user.

### D2. Groups are tags

A group is defined by a lane tag. Membership is having that tag. Moving a task
between groups rewrites the tag on the markdown line.

Rationale: keeps the `#focus` and `due today` query blocks in Daily Notes
working unchanged; keeps `plan-my-day` able to place tasks into lanes by writing
a tag; keeps lanes greppable; and if the plugin is ever uninstalled, no
information is lost. Rejected: plugin-owned group membership stored outside the
note, because it makes lanes invisible to every other view in the vault and
silently breaks the existing Daily Note queries.

### D3. Order persists in a sidecar keyed by lazily-assigned Obsidian block ID

Identity is an Obsidian block ID (`^tm-<base36>`), appended to a task line only
at the moment that task is first manually ordered. Rank lives in the plugin's
`data.json`.

Rationale: ordering needs identity that survives the task text changing.
Content hashing fails on text edits and cannot tell apart two identical lines in
one file. Block IDs are a native Obsidian concept, preserved by Obsidian itself
across edits and file moves, exposed for free as `ListItemCache.id`, and already
hidden from view by the `.cm-blockid` rule in `tasks-readable.css`, written when
Task List Kanban did the same thing. Storing the rank itself inline
(`[order:: 120]`) was rejected: it puts a number that changes on every drag into
the file, producing constant diffs on lines Jon reads every day.

Lazy assignment matters. Most tasks never get manually ordered, so most lines
never gain an ID.

### D4. Editing is quick actions plus a raw-line editor

Row affordances for the frequent operations (complete, priority, due date,
lane). For anything else, clicking the description swaps it for a single-line
input containing the raw task line body, which Jon edits in the emoji syntax he
already writes by hand.

Rationale: a form with a field per attribute is a large amount of UI for a
format Jon is fluent in, and it would need extending every time he invents a
new convention like `🔗 [[note|source]]`. The raw-line editor covers every
field, present and future, for almost no code. Rejected: full structured edit
form for v1; read-only with jump-to-file, which fails the stated goal.

### D5. TypeScript, Svelte 5, esbuild

Rationale: filters, drag state, collapse state and optimistic writes interact,
and plain DOM manipulation gets unpleasant quickly. Svelte 5 has the smallest
runtime of the realistic options, compiles away, and is what Task List Kanban
itself uses, so it is proven inside Obsidian. Rejected: React and Preact, for
bundle weight against no benefit here; plain TypeScript, for the state-handling
cost.

Drag and drop: `@atlaskit/pragmatic-drag-and-drop`. Framework agnostic, small,
built on native HTML5 drag events, and requires explicit opt-in per element,
which keeps it from fighting Obsidian's own drag handlers.

### D6. The plugin parses markdown itself

It does not call into Obsidian Tasks' internals.

Rationale: Tasks exposes no stable API for this. Depending on its internals
means breaking on its releases. Parsing a well-understood line format over 105
lines is a small, testable problem, and Obsidian's own metadata cache supplies
the structural information (which lines are tasks, their nesting, their block
IDs) for free.

### D7. Lane assignment has hotkeys, and the last write can be undone

Added 2026-07-28, after review of the first-run experience.

Triage of Unsorted gets keyboard hotkeys, not just drag. The controller keeps a
one-deep undo of the last write.

Rationale: on day one Unsorted holds roughly 70 of 81 open tasks, and the only
route out of it as originally specified was dragging rows one at a time. That
makes the single most important session, the first one, the slowest. Hotkeys
turn it into a keyboard pass down the queue. Undo exists because a mis-drop
rewrites a tag in a file that is not open in an editor, so Obsidian's own undo
stack cannot reach it, and the vault is not a git repository.

Rejected: multi-select with a bulk lane action, as more surface than a keyboard
pass needs; a full undo stack, because one level covers the mistake that
actually happens and a deeper stack has to reason about writes that landed on
lines since changed on disk. See section 6.8.

---

## 4. Data model

### 4.1 Task line grammar

A superset of what appears in the vault today.

```
<indent>- [<status>] <body> <^blockId>?
```

`body` is a sequence of the description interleaved with metadata tokens. All
metadata tokens are optional and order independent, because the vault contains
both orderings:

```
- [ ] Chat with Sean O'Doherty 📅 2026-07-23 🔗 [[Sean O'Doherty]] #crew #this-week
- [ ] Create a Miro board ... 🔗 [[Projects/Atlas/Migration|plan]] · [[Meetings/...|source]] #atlas/migration #today
```

Tokens:

| Token | Meaning | Notes |
| --- | --- | --- |
| `#tag`, `#tag/sub` | tag | may appear anywhere in the body |
| `🔺` | priority: highest (0) | |
| `⏫` | priority: high (1) | |
| `🔼` | priority: medium (2) | |
| absent | priority: normal (3) | the default |
| `🔽` | priority: low (4) | |
| `⏬` | priority: lowest (5) | |
| `📅 YYYY-MM-DD` | due date | |
| `⏳ YYYY-MM-DD` | scheduled date | |
| `🛫 YYYY-MM-DD` | start date | |
| `➕ YYYY-MM-DD` | created date | |
| `✅ YYYY-MM-DD` | done date | |
| `❌ YYYY-MM-DD` | cancelled date | |
| `🔁 <rule>` | recurrence | preserved verbatim, never interpreted |
| `🆔 <id>`, `⛔ <ids>` | Tasks dependencies | preserved verbatim, not surfaced |
| `🔗 <wikilinks>` | Jon's context-link convention | see below |
| `^blockId` | Obsidian block ID | end of line only |

The `🔗` convention, which is Jon's own and not part of Obsidian Tasks: a `🔗`
followed by one or more links separated by ` · ` (U+00B7 MIDDLE DOT, surrounded
by single spaces). A link aliased `source` is provenance (the meeting or message
the task came from). Any other link is project or person context. Example:

```
🔗 [[Projects/Atlas/Migration|plan]] · [[Meetings/2026-05-11 Crew Chats|source]]
```

A link in the run is either a wikilink or a markdown external link, and a single
run may mix the two. Six lines in the corpus carry external links, and one mixes
both kinds:

```
🔗 [Thread](https://example.com/t/104877) · [[Meetings/2026-05-07 Otto - Sam|source]]
```

Amended 2026-07-28, during phase 1. The original text said wikilinks only, which
the corpus contradicts. Section 6.7 already styled external links, so this was an
omission in the data model rather than a decision to exclude them.

Wikilinks that appear inside the description rather than after a `🔗` stay part
of the description, for example `Chase Harry to complete the review for
[[Ada Fenwick]]`.

Status characters observed and required:

| Char | Status | Default visibility |
| --- | --- | --- |
| `' '` | open | shown |
| `x`, `X` | done | in the collapsed Done section |
| `-` | cancelled | hidden |
| anything else | open, custom status | shown, glyph preserved |

### 4.2 Parsed representation

```ts
export type Priority = 0 | 1 | 2 | 3 | 4 | 5;   // 0 highest, 3 normal, 5 lowest
export type TaskStatus = 'open' | 'done' | 'cancelled' | 'custom';
export type DateKind = 'due' | 'scheduled' | 'start' | 'created' | 'done' | 'cancelled';

export interface ContextLink {
  kind: 'wikilink' | 'external';
  target: string;          // "Projects/Atlas/Migration", or the URL
  alias?: string;          // "handover", or the markdown link text
  isSource: boolean;       // alias === 'source'
}

export interface Task {
  /** Stable identity. Block ID when present, else `${file}::${line}`. */
  id: string;
  blockId?: string;

  file: string;            // vault-relative path
  line: number;            // 0-indexed
  indent: string;          // leading whitespace, verbatim
  parentLine: number;      // from ListItemCache.parent
  section?: string;        // nearest preceding heading text

  raw: string;             // the original line, verbatim
  roundTrips: boolean;     // serialise(this) === raw

  status: TaskStatus;
  statusChar: string;
  description: string;     // metadata stripped, inline links intact
  tags: string[];          // without the leading '#'
  priority: Priority;
  dates: Partial<Record<DateKind, string>>;   // ISO YYYY-MM-DD
  contextLinks: ContextLink[];

  /** Tokens recognised but not managed (🔁, 🆔, ⛔), verbatim, in order. */
  preserved: string[];
}
```

### 4.3 The round-trip guarantee

**This is the most important correctness property in the system.**

For every task line in the vault:

```
serialise(parse(line)) === line
```

`tests/fixtures/vault-corpus.txt` contains 105 task lines and exists for exactly
this test. It must be run as a table test with one assertion per line, so a
failure names the offending line.

*Amended 2026-07-28. The fixture was originally a verbatim capture of the live
vault. This repository is public and the vault holds client detail, colleague
names and personal notes, so the capture was transliterated line for line into
invented content: token structure, indentation, glyphs, link shapes and every
composition count are preserved, only the words changed. `tests/fixtures.test.ts`
asserts the grammar coverage that swap had to keep, and the live-vault counts now
live in the phase 2 and 3 gates in PLAN.md, checked by grep against the real
vault, rather than in a unit test that would drift the moment Jon ticks a box.*

When a line does not round-trip, `roundTrips` is set false. Such a task is
indexed and displayed, but every mutation is refused and the row offers only
"open in file". **A parser that silently mangles a line Jon wrote is worse than
a parser that admits defeat.**

Serialisation rules, needed to make round-tripping achievable:

1. Record the byte offset of each metadata token during parsing and rebuild the
   line by substitution, not by re-emitting tokens in a canonical order. Token
   order and inter-token whitespace are properties of the line, not of the
   model.
2. When a mutation adds a token that was absent, insert it in canonical order:
   priority, then dates in the order created, start, scheduled, due, done,
   cancelled, then recurrence, then dependencies, then `🔗` links, then tags,
   then block ID. This matches the dominant ordering in the vault.
3. When a mutation removes a token, remove exactly one adjoining space with it.
4. Never reflow, re-wrap or trim the description.

### 4.4 Persisted store

`.obsidian/plugins/obsidian-task-master/data.json`, via `Plugin.loadData` and
`Plugin.saveData`.

```ts
export interface GroupDef {
  id: string;              // plugin-owned, stable, e.g. "g-focus"
  label: string;           // "Focus"
  tag: string;             // "focus", without '#'
  collapsed: boolean;
  order: number;
}

export interface StoreData {
  version: 1;
  /** blockId -> sparse rank. Absent means unranked. */
  order: Record<string, number>;
  groups: GroupDef[];
  /** Collapse state for the virtual groups, which have no GroupDef. */
  virtualCollapsed: { unsorted: boolean; done: boolean };
  settings: Settings;
}

export interface Settings {
  excludedPaths: string[];       // default ['Settings', 'Templates']
  addDoneDate: boolean;          // default true
  showCancelled: boolean;        // default false
  doneSectionLimit: number;      // default 50
  fallbackSort: 'priority' | 'due' | 'file';   // default 'priority'
}
```

Default groups, seeded on first run from the lane tags already in the vault:

| id | label | tag | Provenance |
| --- | --- | --- | --- |
| `g-focus` | Focus | `focus` | documented in the Vault Guide |
| `g-today` | Today | `today` | retired kanban column, Todoist import |
| `g-this-week` | This week | `this-week` | retired kanban column, Todoist import |
| `g-blocked` | Blocked | `blocked` | documented in the Vault Guide |

Focus and Blocked are Jon's documented conventions. Today and This week are a
judgement call: they match the columns of the `Actions.md` board being retired
and the tags already on 8 open tasks, so seeding them loses nothing and saves
setup. He can delete either from settings, which never edits a file.

Plus two virtual groups, which are not in `groups` and cannot be renamed,
reordered or deleted:

- **Unsorted**: every open task carrying no lane tag. Rendered last among open
  groups. This is where newly captured tasks surface, and it is the queue Jon
  works through when planning. On day one it holds about 70 of the 81 open
  tasks.
- **Done**: every task with status `done`. Rendered last overall, collapsed by
  default.

Group precedence, since a task can qualify for more than one:

1. Status `done` sends a task to Done, whatever tags it carries. Done always
   wins.
2. Status `cancelled` hides the task unless `settings.showCancelled`, in which
   case it renders in the Done section with a distinct glyph and sorts by
   cancelled date.
3. Otherwise, the first lane tag matching a group in `groups` order wins.
4. No lane tag means Unsorted.

Defaults on first run: `virtualCollapsed` is `{ unsorted: false, done: true }`,
so the working queue is open and completed work is out of the way.

### 4.5 Ranking

Sparse integer ranks, allocated in steps of 1024.

- Appending to a group: `maxRank + 1024`.
- Dropping between neighbours `a` and `b`: `Math.floor((a + b) / 2)`.
- Dropping at the head: `minRank - 1024`.
- When any adjacent gap in a group falls below 2, renormalise that group to
  clean multiples of 1024 and write once.

Ranks are global across groups, not per group, because a task's rank must
survive a move between groups without being recomputed. Sorting is
group-then-rank.

Unranked tasks sort after all ranked tasks in their group, ordered by
`settings.fallbackSort`, then by due date, then by file path and line. So a
fresh vault with no manual ordering still reads sensibly: this is what makes the
first run useful before Jon has dragged anything.

Garbage collection: on load, after `metadataCache.on('resolved')` has fired,
drop any `order` key whose block ID resolves to no task. **Never GC from a
partial index**, or closing Obsidian mid-index would silently discard ordering.

---

## 5. Architecture

### 5.1 Module layout

```
src/
  main.ts                  plugin entry: registerView, commands, ribbon, settings tab
  controller.ts            the only thing the view calls; owns Index, Writer, Store,
                           and the one-deep undo record

  model/                   pure. no Obsidian imports. all the tests live here.
    types.ts               Task, GroupDef, StoreData, Priority, TaskStatus
    tokens.ts              the lexer: one reader per metadata token
    parse.ts               string -> Task
    serialise.ts           Task -> string
    mutate.ts              setStatus, setPriority, setDate, setLaneTag, setBody
    rank.ts                sparse rank allocation and renormalisation
    group.ts               assign tasks to groups, resolve multi-lane conflicts
    filter.ts              filter, search, sort, assemble sections
    paths.ts               excludedPaths matching, at a folder boundary
    summarise.ts           counts by status, tag and file, with subtag rollup

  data/                    the only place that touches the vault.
    TaskIndex.ts           scan, incremental update, emit snapshots
    TaskWriter.ts          resolve line by block ID, vault.process, write queue
    Store.ts               loadData/saveData, migrations, GC

  view/
    TaskMasterView.ts      ItemView shell, mounts the Svelte root
    App.svelte             toolbar + group sections + done section
    Toolbar.svelte
    GroupSection.svelte
    TaskRow.svelte
    TaskEditor.svelte      raw-line inline editor
    dnd.ts                 pragmatic-drag-and-drop wiring, drop-rank computation
    keyboard.ts            view-local key bindings and selection movement

  settings.ts              settings tab and defaults

styles.css                 all scoped under .task-master-view
tests/
  fixtures/vault-corpus.txt   105 task lines, invented, see 4.3
  *.test.ts
```

### 5.2 Boundaries

The point of this layout is that the risky part is pure and the Obsidian part is
thin.

| Layer | Responsibility | Depends on | Tested by |
| --- | --- | --- | --- |
| `model/` | all parsing, serialising, ranking, filtering, grouping | nothing | Vitest, exhaustively |
| `data/` | vault reads, vault writes, persistence | Obsidian API, `model/` | manual checklist |
| `view/` | render and emit intents. Never writes. | `controller.ts` | manual checklist |
| `controller.ts` | orchestrate: take an intent, mutate, write, refresh | `data/`, `model/` | manual checklist |

If a module in `model/` needs an Obsidian import, the boundary is wrong. Fix the
boundary rather than adding the import.

Every file should stay small enough to hold in one head. If one grows past
roughly 250 lines, that is a signal it is doing two things.

### 5.3 Indexing

Initial index, on view open rather than on plugin load, so startup stays cheap:

1. `vault.getMarkdownFiles()`, dropping any path under `settings.excludedPaths`.
2. For each file, `metadataCache.getFileCache(file)` for `listItems` and
   `headings`, and `vault.cachedRead(file)` for the text.
3. For each `ListItemCache` where `task !== undefined`, take the line at
   `position.start.line`, parse it, attach `blockId` from `ListItemCache.id`,
   `parentLine` from `ListItemCache.parent`, and `section` from the nearest
   preceding heading.

Using the metadata cache rather than a regex sweep gives correct handling of
tasks inside code fences and correct nesting, for free.

Incremental updates, all registered with `this.registerEvent`:

| Event | Action |
| --- | --- |
| `metadataCache.on('changed', file)` | reparse that file only, replace its slice of the index |
| `vault.on('delete', file)` | drop that file's tasks |
| `vault.on('rename', file, old)` | remap the path on that file's tasks |
| `metadataCache.on('resolved')` | first fire only: enable order GC |

Re-render is debounced at 50 ms. At this vault size a full reindex would also be
fine; incremental is chosen because it keeps the view from flickering while Jon
types in a Daily Note with the view open in another tab.

### 5.4 Write path

Every mutation follows the same sequence. `TaskWriter` owns it.

1. **Re-resolve the target line.** If the task has a block ID, find it in the
   current `metadataCache` for its file. Otherwise use the recorded line number.
2. **Verify.** Read the file, confirm the line at that position still parses to
   a task whose `raw` matches what was indexed. If it does not, abort: show a
   `Notice` reading "Task changed on disk, view refreshed", reindex the file,
   and drop the mutation. **Never write on a stale read.**
3. **Transform.** Apply the pure `mutate.ts` function to the parsed task and
   serialise.
4. **Write.** `vault.process(file, data => replaceLine(data, line, newLine))`.
   Exactly one line changes.
5. The resulting `metadataCache` change event refreshes the view naturally. No
   manual refresh call.

Writes are serialised through a per-file promise queue, so two fast drags
touching the same file cannot interleave `vault.process` calls.

Specific mutations:

- **Complete.** Status to `x`. If `settings.addDoneDate`, append
  `✅ <today, local date>`. Tags are left alone, including lane tags, so a
  completed task stays attributable to its lane.
- **Uncomplete.** Status to `' '`, remove `✅` and its date.
- **Priority.** Replace or insert the priority glyph. Normal means no glyph.
- **Due date.** Replace, insert or remove `📅` and its date.
- **Change lane.** Remove **every** tag matching a defined group's lane tag, then
  add the target lane tag. Removing all of them rather than just the one the
  group resolver picked is what makes a move out of a multi-lane state
  unambiguous. Domain tags are never touched. A task with no lane tag moving out
  of Unsorted simply gains one. A task moving *into* Unsorted loses its lane tags
  and gains nothing.
- **Set body.** Replace everything between the checkbox and the block ID with
  the edited text, then reparse. If the result does not parse, refuse and keep
  the editor open with an inline error.
- **Assign block ID.** Append ` ^tm-<base36 of a counter>`. Only ever called
  immediately before the first rank is written for that task. Collision check
  against all known block IDs in the vault before writing.

---

## 6. The view

### 6.1 Shell

A full-page `ItemView`, view type `task-master-view`, opened in the main editor
area via `workspace.getLeaf(false)`, not a sidebar.

Entry points: a ribbon icon; the command `Task Master: open task view`; and
reusing an existing leaf of the type if one is already open, per the standard
Obsidian `activateView` pattern.

### 6.2 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [search…]  [tags ▾]  [any|all]  sort: priority ▾  ☐ show done │
├──────────────────────────────────────────────────────────────┤
│ ▾ Focus                                                    3 │
│   ○ Share role-reflection doc with Sarah                     │
│     #crew #focus 🔼 📅 2026-07-08                          │
│   ─────────────────────────────────────────────────────────  │
│   ○ Continue developing the handover swim lanes work         │
│     #atlas/migration #focus 📅 2026-07-15 🔗 Atlas/Migration    │
│   ─────────────────────────────────────────────────────────  │
│   ○ Atlas docs: close-out                   │
│     #atlas/docs #focus 🔺 🔗 Support Docs    │
├──────────────────────────────────────────────────────────────┤
│ ▾ Today                                                    2 │
│ ▸ This week                                                6 │
│ ▸ Blocked                                                  1 │
│ ▾ Unsorted                                                70 │
├──────────────────────────────────────────────────────────────┤
│ ▸ Done                                                    24 │
└──────────────────────────────────────────────────────────────┘
```

Those counts are the real day-one state of the vault, and they are the shape of
the problem: five sixths of the open work has no lane. Unsorted is the working
queue, not an error state, so it renders expanded by default while the populated
lanes above it stay short.

*Amended 2026-07-28, following the phase 2 gate. Unsorted renders **69**, not 70.
The counts here and in section 1.1 are vault counts; the view applies
`excludedPaths`, which drops the illustrative task in `Settings/_Vault Guide.md`.
That task is unlaned, so the whole difference lands on Unsorted. The phase 3 and 4
gates in PLAN.md carry the adjusted figures.*

### 6.3 Task row

Two lines, mirroring the reference screenshot:

- Line 1: checkbox, then the description at full size and weight. Wikilinks in
  the description render as working internal links.
- Line 2, indented to align under the description: tags, priority glyph, due
  date, then context links.

A drag handle appears at the left on hover. The row's own click target is the
description, which opens the inline editor. Clicking a link follows the link and
does not open the editor.

Right-click context menu: complete, priority submenu, set due date, move to
group submenu, open in file, copy task text.

Nested tasks: rendered indented under their parent when both are visible in the
same group. When only a child matches the filter, it is rendered at top level
with a muted breadcrumb showing its parent's description.

### 6.4 Filtering and search

- **Tag filter.** Multi-select over every tag in the index, ordered by
  frequency. Hierarchical prefix matching: selecting `atlas` matches `atlas`,
  `atlas/migration` and `atlas/docs`. An any/all toggle switches
  between OR and AND.
- **Search.** Case-insensitive substring over description and file path,
  debounced 120 ms.
- **Show done.** Toggles the Done section between collapsed and expanded. Done
  tasks are always in their own section, never interleaved.
- **Sort.** Applies to unranked tasks only. Manually ranked tasks always keep
  their rank, because overriding a manual decision with a sort defeats the point
  of having made it.

Filter state is in-memory and resets when the view is closed. It is UI state,
not a preference.

Group sections stay visible while filtered, showing filtered counts, so Jon can
always see the shape of his commitments even when looking at one project.

### 6.5 Drag and drop

- Drag handle only, never the whole row, so text selection still works.
- Within a group: reorders, writes a rank.
- Across groups: rewrites the lane tag *and* writes a rank, in that order. If
  the tag write fails, no rank is written.
- Drop indicator is a 2 px line at the insertion point.
- Dragging onto a collapsed group header appends to the end of that group.
- Drag is disabled for tasks where `roundTrips` is false.

### 6.6 Done section

Collapsed by default. Grouped by done date, descending, with date subheadings.
Capped at `settings.doneSectionLimit`, with a "show all" affordance. Tasks with
no done date sort last under "Completed, no date".

### 6.7 Styling

All CSS in `styles.css`, scoped under `.task-master-view`, using Obsidian's own
variables so Minimal light and dark both work without a second stylesheet:
`--text-normal`, `--text-muted`, `--text-faint`,
`--background-modifier-border`, `--background-secondary`,
`--interactive-accent`.

Reproducing the visual grammar of `tasks-readable.css`:

| Element | Treatment |
| --- | --- |
| Description | full size, `--text-normal`, `line-height` 1.5 |
| Row separator | 1 px `--background-modifier-border`, 10 px padding above and below |
| Checkbox | `margin-right: 0.55em` |
| Metadata line | `font-size: 0.75em` |
| Tags | plain coloured text at `opacity: 0.65`, `margin-right: 0.4em`. No pill: no background, border, box-shadow or inline padding |
| Priority and date glyphs | `opacity: 0.55`, `filter: grayscale(1)`, because emoji ignore `font-size` |
| Internal and external links | `font-size: 0.8em`, `opacity: 0.6`, `margin-right: 0.5em` |
| Done tasks | `line-through`, `--text-faint` |
| Block IDs | never rendered |

The view must look correct with all three of Jon's CSS snippets disabled. It
must not fight them when they are enabled, which the `.task-master-view` scope
achieves, since every snippet selector is scoped to `.markdown-rendered`,
`.cm-content` or `.task-list-kanban-view`.

### 6.8 Keyboard and undo

Per decision D7. All bindings are local to the view and active only when it has
focus, registered on the view's own container rather than as global Obsidian
hotkeys, so they cannot leak into the editor.

| Key | Action |
| --- | --- |
| `j`, `k` | move the selection down and up, across group boundaries |
| `x` | toggle complete on the selection |
| `e` | open the inline editor on the selection |
| `1`-`5` | set priority, `3` meaning normal and therefore removing the glyph |
| `g` then a group key | move the selection to that group |
| `g` then `u` | move the selection to Unsorted, removing its lane tags |
| `/` | focus the search box |
| `Escape` | clear the search box, or close the inline editor |
| `Cmd+Z` | undo the last write |

Group keys are derived from each group's label, first letter, lowercased, with
collisions resolved by group order and shown in the group header. For the seeded
groups that is `f` Focus, `t` Today, `h` This week, `b` Blocked. `u` is reserved
for Unsorted and cannot be claimed by a defined group.

After a lane hotkey the selection advances to the next task, so working down
Unsorted is a repeated single keystroke. This is the whole point of the feature.

Undo is one level deep. The controller records, for the last write only, the
file, the block ID or line, and the previous raw line. Undo re-runs the standard
write path from section 5.4, including its stale-read verification, so an undo
against a line since changed on disk aborts with the same `Notice` rather than
clobbering it. A drag that wrote both a lane tag and a rank is undone as one
unit: the line is restored and the rank reverted together. The record is cleared
on view close, and never persisted.

---

## 7. Error handling

| Condition | Behaviour |
| --- | --- |
| Line does not round-trip | Index and display it. `roundTrips: false`. Mutations and drag disabled. Row shows a muted warning glyph with a tooltip; clicking opens the file. |
| Line at expected position changed on disk | Abort the write. `Notice`: "Task changed on disk, view refreshed". Reindex that file. |
| Task carries two or more lane tags | First match in group order wins. Row shows a warning glyph naming the conflicting tags. |
| Block ID collision when assigning | Retry with a fresh counter value, up to 5 times, then `Notice` and refuse the reorder. |
| `data.json` fails to parse | Rename it to `data.corrupt-<timestamp>.json`, start from defaults, `Notice`. Never silently discard ordering. |
| Group deleted while tasks still carry its tag | Tasks fall into Unsorted. The tag stays on the line. Deleting a group never edits a file. |
| Excluded path contains tasks | Not indexed, not counted, invisible. |
| Vault has zero tasks | Empty state explaining where tasks are read from. |

---

## 8. Testing

### 8.1 Automated, Vitest, over `model/` only

| Suite | What it proves |
| --- | --- |
| `parse.test.ts` | Every token type, in both observed orderings. Tasks in code fences excluded. Every status character. |
| `roundtrip.test.ts` | **The corpus test.** One assertion per line of `tests/fixtures/vault-corpus.txt`, all 105. |
| `fixtures.test.ts` | **Grammar coverage of the fixture**, asserted independently of its content, so the fixture can be replaced without losing coverage. |
| `serialise.test.ts` | Canonical insertion order for newly added tokens. Whitespace handling on token removal. |
| `mutate.test.ts` | Each mutation changes only what it should. Priority normal removes the glyph. Completing adds the done date once, not twice. |
| `rank.test.ts` | Property test: any sequence of moves yields a consistent total order with no collisions. Renormalisation preserves order. Insertion between adjacent ranks always succeeds. |
| `group.test.ts` | Lane assignment. Multi-lane conflict resolution. Unsorted membership. |
| `filter.test.ts` | Tag prefix matching. Any versus all. Search across description and path. Unranked fallback ordering. |

`model/` should reach effectively full branch coverage. It is pure, it is the
entire risk surface, and it is cheap to test.

*Amended 2026-07-28. **`data/` is in the automated suite too.** This section
originally confined Vitest to `model/` on the grounds that it was the entire risk
surface. That was true while `data/` was empty. `TaskIndex` is now around 230 lines
of asynchronous event handling, and a read-only review of it found five defects; a
sixth, a scan overwriting a newer incremental result with stale text, was found by
the first test written against it and could not have been found by reading. Jon
approved the change.*

*The mechanism is a stub for the `obsidian` module, aliased in `vitest.config.ts`,
because the real package ships types only: its `main` is the empty string, since
the implementation is the running app. `tests/fakeVault.ts` drives a vault the
tests control.*

| Suite | What it proves |
| --- | --- |
| `TaskIndex.test.ts` | Only what the metadata cache reports is indexed. Exclusions, headings, block IDs and parent lines are attached. The interleavings a manual check cannot reach: an edit landing mid-scan, two scans overlapping, a read failing, a folder moving into an excluded path, and `isFullyIndexed` staying false until both the cache has resolved and a scan has completed. |
| `TaskWriter.test.ts` | Phase 5. Writes touch one line. A refused write leaves the file byte-identical. |

*Two limits worth stating. The stub is not Obsidian, so a test can only prove
`TaskIndex` behaves correctly given the cache contract, never that the contract was
read right; the per-phase manual gates in 8.2 remain the check on that. And the
stub must stay minimal: the more of Obsidian it grows, the more the tests prove the
stub.*

### 8.2 Manual, per phase

`data/` and `view/` are verified by the checklists in [PLAN.md](PLAN.md). For a
single-user plugin, automating Obsidian's DOM and drag behaviour costs more than
it returns.

One manual check is non-negotiable and belongs in every phase that writes:

> Make one change in the view, then `git diff` the vault. Exactly one line in
> exactly one file must have changed.

---

## 9. Interoperability

- **Obsidian Tasks.** Untouched. Its query blocks keep working. The plugin reads
  and writes the same emoji format, so both tools see the same tasks.
- **`plan-my-day`.** Keeps writing tasks exactly as it does now. When Jon adds a
  group, its lane tag is just another tag the skill can write. No skill change
  is required by this design.
- **Daily Note queries.** The `#focus` and `due today` blocks keep working,
  because lanes remain tags. This is the payoff for decision D2.
- **Task List Kanban.** `Actions.md` can be retired by simply not opening it.
  The block IDs it wrote stay in the files, harmless, and are visible to this
  plugin as ordinary block IDs. They are not `tm-` prefixed, so they will not be
  confused with plugin-assigned ones, and they can be adopted as identity if
  present rather than assigning a second ID to the same line.
- **`colored-tags`.** Provides tag colour via CSS custom properties on `a.tag`.
  Render tags as `a.tag` elements so the colours carry through.
- **`Settings/_Vault Guide.md`.** Two passages are made false by this plugin and
  must be rewritten as part of phase 9: the claim that there is no drag ordering,
  and the description of `Actions.md` as the place to drag to prioritise. Replace
  both with a short description of this view. Leaving stale documentation in
  place is how a vault stops being trustworthy.
- **`Settings/plan-my-day.md`.** The single source of truth for the skill, read at
  run time by both the skill and the scheduled 07:05 weekday task. No change is
  required by this design, because lanes stay tags. If Jon later renames a lane
  tag, that file is the one place to update.

---

## 10. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Parser corrupts a hand-written line | High | The corpus round-trip test, plus the `roundTrips: false` read-only fallback. This is why the guarantee is a first-class requirement rather than a nice-to-have. |
| Block ID noise accumulates in files | Medium | Lazy assignment, so only manually ordered tasks get one. Already hidden by existing CSS. GC of dead order keys. |
| Drag and drop conflicts with Obsidian's own handlers | Medium | `pragmatic-drag-and-drop` requires explicit opt-in per element. Handle-only dragging with propagation stopped on the handle. |
| Svelte 5 in an esbuild Obsidian plugin needs correct setup | Low | Resolved once, in phase 0, before anything depends on it. |
| Order lost when a file is edited by an external tool that strips block IDs | Low | Nothing strips them in this vault. Unranked tasks degrade gracefully to the fallback sort rather than disappearing. |
| Scope creep towards a full task manager | Medium | The non-goals list in section 2.2 is the defence. Anything not listed in section 2.1 is a separate spec. |

---

## 11. Open questions

None blocking. Two worth revisiting after Jon has used it for a fortnight:

1. Whether Unsorted wants to be split by domain tag, given it holds roughly 70 of
   81 open tasks on day one. Deliberately deferred: the answer depends on how
   quickly that queue drains once there is a single place to work it. The tag
   filter is the interim answer.
2. Whether creating tasks from the view earns its place, or whether capture
   genuinely belongs in Daily Notes and `plan-my-day`.
