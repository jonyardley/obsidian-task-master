import { describe, expect, it } from 'vitest';
import { NO_DONE_DATE_LABEL, assembleSections, rowKey } from '../src/model/filter';
import { DONE_GROUP_ID, UNSORTED_GROUP_ID } from '../src/model/group';
import { parseTaskLine } from '../src/model/parse';
import type { GroupDef, Settings, Task } from '../src/model/types';
import { DEFAULT_GROUPS, DEFAULT_SETTINGS } from '../src/settings';

/**
 * Section assembly and sorting per DESIGN.md sections 4.5, 6.2 and 6.6. No
 * filtering yet: that is phase 4.
 */
function parse(line: string, file = 'Inbox.md', line0 = 0): Task {
  const task = parseTaskLine(line, { file, line: line0 });
  if (!task) throw new Error(`expected a task, got null for: ${line}`);
  return task;
}

const GROUPS: GroupDef[] = DEFAULT_GROUPS.map((group) => ({ ...group }));

interface Input {
  tasks: readonly Task[];
  groups?: readonly GroupDef[];
  order?: Record<string, number>;
  virtualCollapsed?: { unsorted: boolean; done: boolean };
  settings?: Partial<Settings>;
  showAllDone?: boolean;
}

function assemble(input: Input) {
  return assembleSections({
    tasks: input.tasks,
    groups: input.groups ?? GROUPS,
    order: input.order ?? {},
    virtualCollapsed: input.virtualCollapsed ?? { unsorted: false, done: true },
    settings: { ...DEFAULT_SETTINGS, ...input.settings },
    showAllDone: input.showAllDone ?? false,
  });
}

function descriptionsIn(input: Input, sectionId: string): string[] {
  const section = assemble(input).find((candidate) => candidate.id === sectionId);
  if (!section) throw new Error(`no section ${sectionId}`);
  return section.rows.map((row) => row.task.description);
}

describe('assembleSections, shape', () => {
  it('renders the defined groups in order, then Unsorted, then Done', () => {
    expect(assemble({ tasks: [] }).map((section) => section.id)).toEqual([
      'g-focus',
      'g-today',
      'g-this-week',
      'g-blocked',
      UNSORTED_GROUP_ID,
      DONE_GROUP_ID,
    ]);
  });

  it('keeps an empty group section visible, so the shape of the commitments shows', () => {
    const sections = assemble({ tasks: [] });
    expect(sections.every((section) => section.rows.length === 0)).toBe(true);
    expect(sections.map((section) => section.count)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('labels the virtual groups', () => {
    const byId = new Map(assemble({ tasks: [] }).map((section) => [section.id, section]));
    expect(byId.get(UNSORTED_GROUP_ID)?.label).toBe('Unsorted');
    expect(byId.get(DONE_GROUP_ID)?.label).toBe('Done');
    expect(byId.get(UNSORTED_GROUP_ID)?.kind).toBe('unsorted');
    expect(byId.get(DONE_GROUP_ID)?.kind).toBe('done');
    expect(byId.get('g-focus')?.kind).toBe('group');
  });

  it('takes collapse state from the group definition and from virtualCollapsed', () => {
    const groups = GROUPS.map((group) => ({ ...group, collapsed: group.id === 'g-today' }));
    const sections = assemble({
      tasks: [],
      groups,
      virtualCollapsed: { unsorted: false, done: true },
    });
    const collapsed = sections.filter((section) => section.collapsed).map((section) => section.id);
    expect(collapsed).toEqual(['g-today', DONE_GROUP_ID]);
  });

  it('counts the day-one composition the way the phase 3 gate states it', () => {
    // One task carries both #blocked and #this-week, so the section counts sum to
    // one more than the number of open tasks. It appears in exactly one section.
    const tasks = [
      parse('- [ ] Focus one #focus'),
      parse('- [ ] Focus two #focus'),
      parse('- [ ] Today one #today'),
      parse('- [ ] This week one #this-week'),
      parse('- [ ] Both #blocked #this-week'),
      parse('- [ ] Unlaned'),
      parse('- [x] Finished ✅ 2026-07-24'),
    ];
    const counts = Object.fromEntries(
      assemble({ tasks }).map((section) => [section.id, section.count]),
    );
    expect(counts).toEqual({
      'g-focus': 2,
      'g-today': 1,
      'g-this-week': 2,
      'g-blocked': 0,
      [UNSORTED_GROUP_ID]: 1,
      [DONE_GROUP_ID]: 1,
    });
    // The gate's per-lane figures come from tag counts, so the double-tagged task
    // is counted twice there and the figures sum to one more than the open tasks.
    // The sections must not: each task appears exactly once.
    const open = tasks.filter((task) => task.status !== 'done').length;
    const byTag = tasks.filter((task) => task.tags.includes('this-week')).length;
    expect(byTag).toBe(2);
    expect(2 + 1 + 2 + 0 + 1).toBe(open);
  });

  it('carries a multi-lane conflict onto the row, so the warning glyph can name it', () => {
    const tasks = [parse('- [ ] Both #blocked #this-week')];
    const section = assemble({ tasks }).find((candidate) => candidate.id === 'g-this-week');
    expect(section?.rows[0]?.conflicts).toEqual(['this-week', 'blocked']);
  });

  it('leaves conflicts empty on an ordinary row', () => {
    const tasks = [parse('- [ ] Focus one #focus')];
    const section = assemble({ tasks }).find((candidate) => candidate.id === 'g-focus');
    expect(section?.rows[0]?.conflicts).toEqual([]);
  });
});

describe('assembleSections, sorting', () => {
  const ranked = (blockId: string, description: string): Task =>
    parse(`- [ ] ${description} #focus ^${blockId}`);

  it('puts ranked tasks first, in rank order', () => {
    const tasks = [ranked('a', 'third'), ranked('b', 'first'), ranked('c', 'second')];
    const order = { a: 3072, b: 1024, c: 2048 };
    expect(descriptionsIn({ tasks, order }, 'g-focus')).toEqual(['first', 'second', 'third']);
  });

  it('puts unranked tasks after every ranked task', () => {
    const tasks = [
      parse('- [ ] unranked, high priority #focus 🔺'),
      ranked('a', 'ranked, no priority'),
    ];
    expect(descriptionsIn({ tasks, order: { a: 1024 } }, 'g-focus')).toEqual([
      'ranked, no priority',
      'unranked, high priority',
    ]);
  });

  it('ignores a rank belonging to a task that is no longer there', () => {
    const tasks = [ranked('a', 'only')];
    expect(descriptionsIn({ tasks, order: { a: 1024, gone: 1 } }, 'g-focus')).toEqual(['only']);
  });

  it('orders unranked tasks by priority when fallbackSort is priority', () => {
    const tasks = [
      parse('- [ ] normal #focus'),
      parse('- [ ] lowest #focus ⏬'),
      parse('- [ ] highest #focus 🔺'),
      parse('- [ ] high #focus ⏫'),
    ];
    expect(descriptionsIn({ tasks, settings: { fallbackSort: 'priority' } }, 'g-focus')).toEqual([
      'highest',
      'high',
      'normal',
      'lowest',
    ]);
  });

  it('orders unranked tasks by due date when fallbackSort is due, undated last', () => {
    const tasks = [
      parse('- [ ] undated #focus 🔺'),
      parse('- [ ] later #focus 📅 2026-08-01'),
      parse('- [ ] sooner #focus 📅 2026-07-20'),
    ];
    expect(descriptionsIn({ tasks, settings: { fallbackSort: 'due' } }, 'g-focus')).toEqual([
      'sooner',
      'later',
      'undated',
    ]);
  });

  it('orders unranked tasks by file then line when fallbackSort is file', () => {
    const tasks = [
      parse('- [ ] b second #focus', 'B.md', 9),
      parse('- [ ] b first #focus', 'B.md', 2),
      parse('- [ ] a only #focus', 'A.md', 40),
    ];
    expect(descriptionsIn({ tasks, settings: { fallbackSort: 'file' } }, 'g-focus')).toEqual([
      'a only',
      'b first',
      'b second',
    ]);
  });

  it('breaks a priority tie by due date, then by file and line', () => {
    const tasks = [
      parse('- [ ] same priority, no due, file B #focus', 'B.md', 0),
      parse('- [ ] same priority, no due, file A, line 5 #focus', 'A.md', 5),
      parse('- [ ] same priority, no due, file A, line 1 #focus', 'A.md', 1),
      parse('- [ ] same priority, due soon #focus 📅 2026-07-20', 'Z.md', 0),
    ];
    expect(descriptionsIn({ tasks }, 'g-focus')).toEqual([
      'same priority, due soon',
      'same priority, no due, file A, line 1',
      'same priority, no due, file A, line 5',
      'same priority, no due, file B',
    ]);
  });

  it('sorts each section independently, since ranks are global not per group', () => {
    const tasks = [
      parse('- [ ] focus, rank 2048 #focus ^a'),
      parse('- [ ] today, rank 1024 #today ^b'),
    ];
    const sections = assemble({ tasks, order: { a: 2048, b: 1024 } });
    expect(sections.find((s) => s.id === 'g-focus')?.rows).toHaveLength(1);
    expect(sections.find((s) => s.id === 'g-today')?.rows).toHaveLength(1);
  });
});

describe('assembleSections, the Done section', () => {
  it('groups by done date descending, with the undated group last', () => {
    const tasks = [
      parse('- [x] older ✅ 2026-07-20'),
      parse('- [x] undated'),
      parse('- [x] newer ✅ 2026-07-24'),
      parse('- [x] newer too ✅ 2026-07-24'),
    ];
    const done = assemble({ tasks }).find((section) => section.id === DONE_GROUP_ID);
    expect(done?.dateGroups?.map((group) => group.label)).toEqual([
      '2026-07-24',
      '2026-07-20',
      NO_DONE_DATE_LABEL,
    ]);
    expect(done?.dateGroups?.[0]?.rows.map((row) => row.task.description)).toEqual([
      'newer',
      'newer too',
    ]);
  });

  it('keeps rows and dateGroups holding the same tasks in the same order', () => {
    const tasks = [parse('- [x] older ✅ 2026-07-20'), parse('- [x] newer ✅ 2026-07-24')];
    const done = assemble({ tasks }).find((section) => section.id === DONE_GROUP_ID);
    const flattened = done?.dateGroups?.flatMap((group) => group.rows) ?? [];
    expect(flattened.map((row) => row.task.description)).toEqual(
      done?.rows.map((row) => row.task.description),
    );
  });

  it('caps the rows at doneSectionLimit and reports how many were hidden', () => {
    const tasks = Array.from({ length: 5 }, (_unused, index) =>
      parse(`- [x] done ${index} ✅ 2026-07-2${index}`),
    );
    const done = assemble({ tasks, settings: { doneSectionLimit: 2 } }).find(
      (section) => section.id === DONE_GROUP_ID,
    );
    expect(done?.count).toBe(5);
    expect(done?.rows).toHaveLength(2);
    expect(done?.hidden).toBe(3);
  });

  it('shows everything when showAllDone is set', () => {
    const tasks = Array.from({ length: 5 }, (_unused, index) =>
      parse(`- [x] done ${index} ✅ 2026-07-2${index}`),
    );
    const done = assemble({ tasks, settings: { doneSectionLimit: 2 }, showAllDone: true }).find(
      (section) => section.id === DONE_GROUP_ID,
    );
    expect(done?.rows).toHaveLength(5);
    expect(done?.hidden).toBe(0);
  });

  it('hides cancelled tasks by default', () => {
    const tasks = [parse('- [-] abandoned ❌ 2026-07-22'), parse('- [x] finished ✅ 2026-07-24')];
    const done = assemble({ tasks }).find((section) => section.id === DONE_GROUP_ID);
    expect(done?.rows.map((row) => row.task.description)).toEqual(['finished']);
    expect(done?.count).toBe(1);
  });

  it('shows cancelled tasks in Done, sorted by cancelled date, when showCancelled is on', () => {
    const tasks = [
      parse('- [x] finished ✅ 2026-07-22'),
      parse('- [-] abandoned ❌ 2026-07-24'),
    ];
    const done = assemble({ tasks, settings: { showCancelled: true } }).find(
      (section) => section.id === DONE_GROUP_ID,
    );
    expect(done?.rows.map((row) => row.task.description)).toEqual(['abandoned', 'finished']);
    expect(done?.dateGroups?.map((group) => group.label)).toEqual(['2026-07-24', '2026-07-22']);
  });

  it('never leaves a cancelled task in an open lane', () => {
    const tasks = [parse('- [-] abandoned #focus ❌ 2026-07-22')];
    const sections = assemble({ tasks, settings: { showCancelled: true } });
    expect(sections.find((section) => section.id === 'g-focus')?.rows).toHaveLength(0);
    expect(sections.find((section) => section.id === DONE_GROUP_ID)?.rows).toHaveLength(1);
  });

  it('leaves the open sections uncapped', () => {
    const tasks = Array.from({ length: 5 }, (_unused, index) =>
      parse(`- [ ] open ${index} #focus`),
    );
    const focus = assemble({ tasks, settings: { doneSectionLimit: 2 } }).find(
      (section) => section.id === 'g-focus',
    );
    expect(focus?.rows).toHaveLength(5);
    expect(focus?.hidden).toBe(0);
  });
});

describe('rowKey', () => {
  it('distinguishes two files carrying the same block ID', () => {
    // Block IDs are unique within a file, not across the vault, and Task List
    // Kanban left plenty behind. A repeated key throws in a Svelte keyed block.
    const a = parse('- [ ] One #focus ^loe1wz', 'A.md');
    const b = parse('- [ ] Two #focus ^loe1wz', 'B.md');
    expect(a.id).toBe(b.id);
    expect(rowKey({ task: a, conflicts: [] })).not.toBe(rowKey({ task: b, conflicts: [] }));
  });

  it('gives every row in a section a distinct key', () => {
    const tasks = [
      parse('- [ ] One #focus ^loe1wz', 'A.md', 0),
      parse('- [ ] Two #focus ^loe1wz', 'B.md', 0),
      parse('- [ ] Three #focus', 'A.md', 1),
      parse('- [ ] Four #focus', 'A.md', 2),
    ];
    const section = assemble({ tasks }).find((candidate) => candidate.id === 'g-focus');
    const keys = section?.rows.map(rowKey) ?? [];
    expect(new Set(keys).size).toBe(4);
  });
});

describe('assembleSections, the Done cap at its edges', () => {
  const dated = (index: number, date: string): Task =>
    parse(`- [x] done ${index} \u2705 ${date}`, 'A.md', index);

  it('shows nothing when the limit is zero, and still reports the total', () => {
    const tasks = [dated(0, '2026-07-24'), dated(1, '2026-07-23')];
    const done = assemble({ tasks, settings: { doneSectionLimit: 0 } }).find(
      (section) => section.id === DONE_GROUP_ID,
    );
    expect(done?.rows).toEqual([]);
    expect(done?.dateGroups).toEqual([]);
    expect(done?.count).toBe(2);
    expect(done?.hidden).toBe(2);
    expect(done?.overCap).toBe(true);
  });

  it('splits a date group cleanly when the cap lands inside one', () => {
    const tasks = [dated(0, '2026-07-24'), dated(1, '2026-07-24'), dated(2, '2026-07-24')];
    const done = assemble({ tasks, settings: { doneSectionLimit: 2 } }).find(
      (section) => section.id === DONE_GROUP_ID,
    );
    expect(done?.dateGroups).toHaveLength(1);
    expect(done?.dateGroups?.[0]?.rows).toHaveLength(2);
    expect(done?.hidden).toBe(1);
  });

  it('is not over its cap when it sits exactly on it', () => {
    const tasks = [dated(0, '2026-07-24'), dated(1, '2026-07-23')];
    const done = assemble({ tasks, settings: { doneSectionLimit: 2 } }).find(
      (section) => section.id === DONE_GROUP_ID,
    );
    expect(done?.hidden).toBe(0);
    expect(done?.overCap).toBe(false);
  });

  it('stays over its cap while showing everything, so the fold-back stays offered', () => {
    const tasks = [dated(0, '2026-07-24'), dated(1, '2026-07-23')];
    const done = assemble({
      tasks,
      settings: { doneSectionLimit: 1 },
      showAllDone: true,
    }).find((section) => section.id === DONE_GROUP_ID);
    expect(done?.hidden).toBe(0);
    expect(done?.overCap).toBe(true);
  });

  it('reports no cap on the open sections', () => {
    const tasks = [parse('- [ ] open #focus')];
    const focus = assemble({ tasks, settings: { doneSectionLimit: 0 } }).find(
      (section) => section.id === 'g-focus',
    );
    expect(focus?.overCap).toBe(false);
  });
});
