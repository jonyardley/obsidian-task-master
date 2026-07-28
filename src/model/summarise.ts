import type { Task, TaskStatus } from './types';

/**
 * Index composition, for the dev dump command in PLAN.md phase 2 whose numbers
 * are the phase 2 gate.
 *
 * Nothing in src/model/ may import from Obsidian. See DESIGN.md section 5.2.
 */

export interface IndexSummary {
  total: number;
  /** Statuses no task carries are absent rather than zero. */
  byStatus: Partial<Record<TaskStatus, number>>;
  /** Tags exactly as written, without the leading '#'. */
  byTag: Record<string, number>;
  /**
   * Tags with every nested tag rolled up into its ancestors, so `#atlas/docs`
   * counts towards `atlas` too. The gates are stated as "`#atlas` or one of its
   * subtags", and this is what makes that checkable without counting by hand.
   */
  byTagWithSubtags: Record<string, number>;
  byFile: Record<string, number>;
}

export function summariseTasks(tasks: readonly Task[]): IndexSummary {
  const byStatus: Partial<Record<TaskStatus, number>> = {};
  const byTag: Record<string, number> = {};
  const byTagWithSubtags: Record<string, number> = {};
  const byFile: Record<string, number> = {};

  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    bump(byFile, task.file);
    // Via a set, so a line repeating a tag still counts once.
    for (const tag of new Set(task.tags)) bump(byTag, tag);
    for (const tag of withAncestors(task.tags)) bump(byTagWithSubtags, tag);
  }

  return { total: tasks.length, byStatus, byTag, byTagWithSubtags, byFile };
}

function bump(into: Record<string, number>, key: string): void {
  into[key] = (into[key] ?? 0) + 1;
}

function withAncestors(tags: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const tag of tags) {
    const parts = tag.split('/');
    for (let i = 1; i <= parts.length; i += 1) {
      out.add(parts.slice(0, i).join('/'));
    }
  }
  return out;
}
