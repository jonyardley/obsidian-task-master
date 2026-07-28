import type { GroupDef, Task } from './types';

/**
 * Which group a task belongs to, per DESIGN.md section 4.4.
 *
 * Nothing in src/model/ may import from Obsidian. See DESIGN.md section 5.2.
 */

/** The virtual groups. Neither is a `GroupDef`, so neither can be renamed or moved. */
export const UNSORTED_GROUP_ID = 'v-unsorted';
export const DONE_GROUP_ID = 'v-done';

export interface GroupAssignment {
  groupId: string;
  /**
   * Every defined lane tag on the task, in group order, when it carries more than
   * one. Empty otherwise. DESIGN.md section 7 asks the row to name them.
   */
  conflicts: string[];
}

export function orderedGroups(groups: readonly GroupDef[]): GroupDef[] {
  return [...groups].sort((a, b) => a.order - b.order);
}

export function assignGroup(task: Task, groups: readonly GroupDef[]): GroupAssignment {
  if (task.status === 'done' || task.status === 'cancelled') {
    return { groupId: DONE_GROUP_ID, conflicts: [] };
  }

  // Exact match, not prefix: a lane is one tag, so `#focus/later` is a domain tag
  // that happens to nest under a lane name. Hierarchical matching is the tag
  // filter's job, in phase 4.
  const tags = new Set(task.tags);
  const matched = orderedGroups(groups).filter((group) => tags.has(group.tag));

  const first = matched[0];
  if (first === undefined) return { groupId: UNSORTED_GROUP_ID, conflicts: [] };

  return {
    groupId: first.id,
    conflicts: matched.length > 1 ? matched.map((group) => group.tag) : [],
  };
}
