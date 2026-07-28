import { describe, expect, it } from 'vitest';
import { NO_DONE_DATE_LABEL, assembleSections, rowKey } from '../src/model/filter';
import { DONE_GROUP_ID, UNSORTED_GROUP_ID } from '../src/model/group';
import { parseTaskLine } from '../src/model/parse';
import { EMPTY_FILTER, tagFacets, type FilterState } from '../src/model/query';
import type { GroupDef, Settings, Task } from '../src/model/types';
import { DEFAULT_GROUPS, DEFAULT_SETTINGS } from '../src/settings';
import { corpusLines } from './corpus';

/** Section assembly, filtering and sorting per DESIGN.md sections 4.5, 6.2, 6.4 and 6.6. */
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
  filter?: Partial<FilterState>;
}

function assemble(input: Input) {
  return assembleSections({
    tasks: input.tasks,
    groups: input.groups ?? GROUPS,
    order: input.order ?? {},
    virtualCollapsed: input.virtualCollapsed ?? { unsorted: false, done: true },
    settings: { ...DEFAULT_SETTINGS, ...input.settings },
    showAllDone: input.showAllDone ?? false,
    filter: { ...EMPTY_FILTER, ...input.filter },
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

describe('assembleSections, filtering', () => {
  const tasks = [
    parse('- [ ] Atlas focus task #atlas/docs #focus', 'Projects/Atlas.md', 0),
    parse('- [ ] Atlas today task #atlas/migration #today', 'Projects/Atlas.md', 1),
    parse('- [ ] Crew focus task #crew #focus', 'People/Crew.md', 0),
    parse('- [ ] Unlaned atlas task #atlas', 'Inbox.md', 0),
    parse('- [x] Atlas done task #atlas/docs ✅ 2026-07-24', 'Projects/Atlas.md', 2),
  ];

  function countsFor(filter: Partial<FilterState>): Record<string, number> {
    return Object.fromEntries(
      assemble({ tasks, filter }).map((section) => [section.id, section.count]),
    );
  }

  it('changes nothing when the filter is empty', () => {
    expect(countsFor({})).toEqual({
      'g-focus': 2,
      'g-today': 1,
      'g-this-week': 0,
      'g-blocked': 0,
      [UNSORTED_GROUP_ID]: 1,
      [DONE_GROUP_ID]: 1,
    });
  });

  it('keeps every section visible while filtered, showing filtered counts', () => {
    const sections = assemble({ tasks, filter: { tags: ['crew'] } });
    expect(sections.map((section) => section.id)).toEqual([
      'g-focus',
      'g-today',
      'g-this-week',
      'g-blocked',
      UNSORTED_GROUP_ID,
      DONE_GROUP_ID,
    ]);
    expect(countsFor({ tags: ['crew'] })).toEqual({
      'g-focus': 1,
      'g-today': 0,
      'g-this-week': 0,
      'g-blocked': 0,
      [UNSORTED_GROUP_ID]: 0,
      [DONE_GROUP_ID]: 0,
    });
  });

  it('reports the unfiltered count alongside, so the shape of the whole stays visible', () => {
    const sections = assemble({ tasks, filter: { tags: ['crew'] } });
    const focus = sections.find((section) => section.id === 'g-focus');
    expect(focus?.count).toBe(1);
    expect(focus?.total).toBe(2);
    expect(sections.find((section) => section.id === DONE_GROUP_ID)?.total).toBe(1);
  });

  it('leaves total equal to count when nothing is filtered out', () => {
    for (const section of assemble({ tasks })) expect(section.total).toBe(section.count);
  });

  it('matches subtags when a parent tag is selected', () => {
    expect(countsFor({ tags: ['atlas'] })).toEqual({
      'g-focus': 1,
      'g-today': 1,
      'g-this-week': 0,
      'g-blocked': 0,
      [UNSORTED_GROUP_ID]: 1,
      [DONE_GROUP_ID]: 1,
    });
  });

  it('narrows with all, where any would widen', () => {
    expect(countsFor({ tags: ['atlas', 'focus'], tagMode: 'any' })['g-focus']).toBe(2);
    expect(countsFor({ tags: ['atlas', 'focus'], tagMode: 'all' })['g-focus']).toBe(1);
  });

  it('filters the Done section too, so a filtered view holds one project only', () => {
    const done = assemble({ tasks, filter: { tags: ['crew'] } }).find(
      (section) => section.id === DONE_GROUP_ID,
    );
    expect(done?.rows).toEqual([]);
    expect(done?.count).toBe(0);
    expect(done?.total).toBe(1);
  });

  it('searches the description and the file path', () => {
    expect(countsFor({ search: 'crew focus' })['g-focus']).toBe(1);
    expect(countsFor({ search: 'people/' })['g-focus']).toBe(1);
    expect(countsFor({ search: 'projects/' })['g-focus']).toBe(1);
    expect(countsFor({ search: 'projects/' })['g-today']).toBe(1);
  });

  it('caps the filtered rows, not the unfiltered ones', () => {
    // The cap counts what the filter left, so "show all" offers the filtered set and
    // a project with three completed tasks is never folded away behind a cap that
    // the rest of the vault filled up.
    const done = [
      ...Array.from({ length: 4 }, (_unused, index) =>
        parse(`- [x] crew done ${index} #crew ✅ 2026-07-2${index}`, 'People/Crew.md', index),
      ),
      ...Array.from({ length: 6 }, (_unused, index) =>
        parse(`- [x] atlas done ${index} #atlas ✅ 2026-07-1${index}`, 'Projects/Atlas.md', index),
      ),
    ];
    const section = assemble({
      tasks: done,
      settings: { doneSectionLimit: 5 },
      filter: { tags: ['crew'] },
    }).find((candidate) => candidate.id === DONE_GROUP_ID);

    expect(section?.total).toBe(10);
    expect(section?.count).toBe(4);
    expect(section?.rows).toHaveLength(4);
    expect(section?.hidden).toBe(0);
    expect(section?.overCap).toBe(false);
  });

  it('still reports a cap the filtered rows exceed', () => {
    const done = Array.from({ length: 4 }, (_unused, index) =>
      parse(`- [x] crew done ${index} #crew ✅ 2026-07-2${index}`, 'People/Crew.md', index),
    );
    const section = assemble({
      tasks: done,
      settings: { doneSectionLimit: 2 },
      filter: { tags: ['crew'] },
    }).find((candidate) => candidate.id === DONE_GROUP_ID);

    expect(section?.count).toBe(4);
    expect(section?.rows).toHaveLength(2);
    expect(section?.hidden).toBe(2);
    expect(section?.overCap).toBe(true);
  });

  it('excludes a cancelled task from the totals as well as the rows', () => {
    const withCancelled = [...tasks, parse('- [-] Atlas abandoned #atlas ❌ 2026-07-22', 'A.md')];
    const done = assemble({ tasks: withCancelled }).find(
      (section) => section.id === DONE_GROUP_ID,
    );
    expect(done?.count).toBe(1);
    expect(done?.total).toBe(1);
  });
});

describe('assembleSections, the sort override', () => {
  const tasks = [
    parse('- [ ] undated, high #focus 🔺', 'B.md', 0),
    parse('- [ ] dated, normal #focus 📅 2026-07-20', 'A.md', 0),
  ];

  it('follows settings.fallbackSort when the filter names no sort', () => {
    expect(descriptionsIn({ tasks, settings: { fallbackSort: 'priority' } }, 'g-focus')).toEqual([
      'undated, high',
      'dated, normal',
    ]);
  });

  it('overrides the setting for the session when the toolbar names a sort', () => {
    expect(
      descriptionsIn(
        { tasks, settings: { fallbackSort: 'priority' }, filter: { sort: 'due' } },
        'g-focus',
      ),
    ).toEqual(['dated, normal', 'undated, high']);
  });

  it('leaves Done in completion-date order, which the sort selector does not reach', () => {
    const done = [
      parse('- [x] older, high priority 🔺 ✅ 2026-07-20', 'A.md', 0),
      parse('- [x] newer, no priority ✅ 2026-07-24', 'B.md', 0),
    ];
    for (const sort of ['priority', 'due', 'file'] as const) {
      expect(descriptionsIn({ tasks: done, filter: { sort } }, DONE_GROUP_ID)).toEqual([
        'newer, no priority',
        'older, high priority',
      ]);
    }
  });

  it('never reorders a ranked task, whichever sort is chosen', () => {
    const ranked = [
      parse('- [ ] ranked last, high priority #focus 🔺 ^a'),
      parse('- [ ] ranked first, no priority #focus ^b'),
    ];
    const order = { a: 2048, b: 1024 };
    for (const sort of ['priority', 'due', 'file'] as const) {
      expect(descriptionsIn({ tasks: ranked, order, filter: { sort } }, 'g-focus')).toEqual([
        'ranked first, no priority',
        'ranked last, high priority',
      ]);
    }
  });
});

describe('assembleSections, filtering the corpus', () => {
  // The automated analogue of the phase 4 gate in PLAN.md. The gate's own figure is
  // 43, one lower, because the live vault's excluded Settings/_Vault Guide.md
  // carries the parent tag and the corpus has no excluded path.
  const tasks = corpusLines().map((line, index) => parse(line, 'Corpus.md', index));

  function openRows(filter: Partial<FilterState>): number {
    return assemble({ tasks, filter })
      .filter((section) => section.kind !== 'done')
      .reduce((total, section) => total + section.count, 0);
  }

  it('finds all 44 open #atlas tasks from the parent tag alone', () => {
    expect(openRows({ tags: ['atlas'] })).toBe(44);
  });

  it('adds up from the parent tag and its two subtags', () => {
    expect(openRows({ tags: ['atlas/docs'] })).toBe(18);
    expect(openRows({ tags: ['atlas/migration'] })).toBe(17);
    expect(openRows({ tags: ['atlas', 'atlas/docs', 'atlas/migration'], tagMode: 'any' })).toBe(44);
  });

  it('narrows to the intersection under all', () => {
    expect(openRows({ tags: ['focus'] })).toBe(3);
    expect(openRows({ tags: ['atlas', 'focus'], tagMode: 'any' })).toBe(45);
    expect(openRows({ tags: ['atlas', 'focus'], tagMode: 'all' })).toBe(2);
  });

  it('searches the description', () => {
    expect(openRows({ search: 'handover' })).toBe(2);
  });

  it('searches the file path, matching every task in the file', () => {
    expect(openRows({ search: 'corpus.md' })).toBe(81);
  });

  it('offers atlas and both its subtags in the tag facets', () => {
    const facets = tagFacets(tasks);
    const byTag = new Map(facets.map((facet) => [facet.tag, facet.count]));
    expect(byTag.get('atlas')).toBe(51);
    expect(byTag.get('atlas/docs')).toBe(18);
    expect(byTag.get('atlas/migration')).toBe(17);
    // Ordered by frequency, so the biggest project sits at the top of the dropdown.
    expect(facets[0]?.tag).toBe('atlas');
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
