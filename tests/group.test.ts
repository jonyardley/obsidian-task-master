import { describe, expect, it } from 'vitest';
import { DONE_GROUP_ID, UNSORTED_GROUP_ID, assignGroup, orderedGroups } from '../src/model/group';
import { parseTaskLine } from '../src/model/parse';
import type { GroupDef, Task } from '../src/model/types';

/**
 * Group assignment per DESIGN.md section 4.4, "Group precedence". The virtual
 * Unsorted and Done groups are not `GroupDef`s and cannot be reordered.
 */
function parse(line: string, file = 'Inbox.md'): Task {
  const task = parseTaskLine(line, { file });
  if (!task) throw new Error(`expected a task, got null for: ${line}`);
  return task;
}

const GROUPS: GroupDef[] = [
  { id: 'g-focus', label: 'Focus', tag: 'focus', collapsed: false, order: 0 },
  { id: 'g-today', label: 'Today', tag: 'today', collapsed: false, order: 1 },
  { id: 'g-this-week', label: 'This week', tag: 'this-week', collapsed: false, order: 2 },
  { id: 'g-blocked', label: 'Blocked', tag: 'blocked', collapsed: false, order: 3 },
];

describe('orderedGroups', () => {
  it('orders by order, not by array position', () => {
    const shuffled = [GROUPS[3]!, GROUPS[0]!, GROUPS[2]!, GROUPS[1]!];
    expect(orderedGroups(shuffled).map((group) => group.id)).toEqual([
      'g-focus',
      'g-today',
      'g-this-week',
      'g-blocked',
    ]);
  });

  it('does not mutate its input', () => {
    const shuffled = [GROUPS[3]!, GROUPS[0]!];
    orderedGroups(shuffled);
    expect(shuffled.map((group) => group.id)).toEqual(['g-blocked', 'g-focus']);
  });
});

describe('assignGroup', () => {
  it('sends a task with a lane tag to that lane', () => {
    expect(assignGroup(parse('- [ ] Draft the crew note #focus'), GROUPS)).toEqual({
      groupId: 'g-focus',
      conflicts: [],
    });
  });

  it('sends a task with no lane tag to Unsorted', () => {
    expect(assignGroup(parse('- [ ] Draft the crew note #atlas/docs'), GROUPS)).toEqual({
      groupId: UNSORTED_GROUP_ID,
      conflicts: [],
    });
  });

  it('sends a task with no tags at all to Unsorted', () => {
    expect(assignGroup(parse('- [ ] Draft the crew note'), GROUPS).groupId).toBe(UNSORTED_GROUP_ID);
  });

  it('sends a done task to Done whatever lane tag it carries', () => {
    const task = parse('- [x] Draft the crew note #focus ✅ 2026-07-24');
    expect(assignGroup(task, GROUPS)).toEqual({ groupId: DONE_GROUP_ID, conflicts: [] });
  });

  it('sends a cancelled task to Done, leaving visibility to the caller', () => {
    const task = parse('- [-] Draft the crew note #focus ❌ 2026-07-24');
    expect(task.status).toBe('cancelled');
    expect(assignGroup(task, GROUPS).groupId).toBe(DONE_GROUP_ID);
  });

  it('treats a custom status as active, so it still lands in its lane', () => {
    const task = parse('- [/] Draft the crew note #today');
    expect(task.status).toBe('custom');
    expect(assignGroup(task, GROUPS).groupId).toBe('g-today');
  });

  it('resolves a multi-lane task to the first group in group order', () => {
    // The live vault has exactly one of these, in Inbox.md: #blocked and
    // #this-week on one line. This is the case the phase 3 gate arithmetic turns
    // on, since it must appear in one group and not both.
    const task = parse('- [ ] Waiting on the vendor #blocked #this-week');
    expect(assignGroup(task, GROUPS)).toEqual({
      groupId: 'g-this-week',
      conflicts: ['this-week', 'blocked'],
    });
  });

  it('resolves by group order rather than tag order on the line', () => {
    const task = parse('- [ ] Waiting on the vendor #this-week #blocked');
    expect(assignGroup(task, GROUPS).groupId).toBe('g-this-week');
  });

  it('follows a reordered group list', () => {
    const reordered: GroupDef[] = [
      { ...GROUPS[3]!, order: 0 },
      { ...GROUPS[2]!, order: 1 },
    ];
    const task = parse('- [ ] Waiting on the vendor #blocked #this-week');
    expect(assignGroup(task, reordered).groupId).toBe('g-blocked');
  });

  it('reports conflicts only when more than one lane tag is present', () => {
    const task = parse('- [ ] Draft the crew note #focus #atlas/docs');
    expect(assignGroup(task, GROUPS).conflicts).toEqual([]);
  });

  it('matches a lane tag exactly, not by prefix', () => {
    // Hierarchical matching belongs to the tag filter in phase 4. A lane is one
    // tag, so `#focus/later` is a domain tag that happens to nest under a lane
    // name and must not silently join the Focus lane.
    const task = parse('- [ ] Draft the crew note #focus/later');
    expect(assignGroup(task, GROUPS).groupId).toBe(UNSORTED_GROUP_ID);
  });

  it('sends every open task to Unsorted when no groups are defined', () => {
    const task = parse('- [ ] Draft the crew note #focus');
    expect(assignGroup(task, []).groupId).toBe(UNSORTED_GROUP_ID);
  });

  it('counts a repeated lane tag once, so it is not read as a conflict', () => {
    const task = parse('- [ ] Draft the crew note #focus #focus');
    expect(assignGroup(task, GROUPS)).toEqual({ groupId: 'g-focus', conflicts: [] });
  });
});
