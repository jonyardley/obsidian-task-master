import { DONE_GROUP_ID, UNSORTED_GROUP_ID, assignGroup, orderedGroups } from './group';
import type { GroupDef, Settings, Task } from './types';

/**
 * Sorting and section assembly, per DESIGN.md sections 4.5, 6.2 and 6.6.
 * Filtering and search arrive in phase 4.
 *
 * Nothing in src/model/ may import from Obsidian. See DESIGN.md section 5.2.
 */

export const NO_DONE_DATE_LABEL = 'Completed, no date';

export interface Row {
  task: Task;
  /** Absent when the task has never been dragged. See DESIGN.md section 4.5. */
  rank?: number;
  /** Lane tags in play when the task carries more than one. */
  conflicts: readonly string[];
}

export interface DoneDateGroup {
  /** ISO YYYY-MM-DD, absent for tasks completed without a date. */
  date?: string;
  label: string;
  rows: Row[];
}

export type SectionKind = 'group' | 'unsorted' | 'done';

export interface Section {
  id: string;
  label: string;
  kind: SectionKind;
  collapsed: boolean;
  /** Every task in the section, counted before the Done cap applies. */
  count: number;
  rows: Row[];
  /** Done only: the same rows, split under date subheadings. */
  dateGroups?: DoneDateGroup[];
  /** Done only: how many rows the cap dropped. */
  hidden: number;
  /** Done only: true when there are more tasks than the cap allows. */
  overCap: boolean;
}

export interface AssembleInput {
  tasks: readonly Task[];
  groups: readonly GroupDef[];
  /** blockId -> rank, from the persisted store. */
  order: Record<string, number>;
  virtualCollapsed: { unsorted: boolean; done: boolean };
  settings: Settings;
  /** The "show all" affordance on the Done section. DESIGN.md section 6.6. */
  showAllDone: boolean;
}

/**
 * A key unique across the whole vault, for the view's keyed blocks. `Task.id` is
 * not: a block ID is unique within its file only, so two files can carry the same
 * one, and Task List Kanban left plenty behind.
 */
export function rowKey(row: Row): string {
  return `${row.task.file}::${row.task.blockId ?? row.task.line}`;
}

export function assembleSections(input: AssembleInput): Section[] {
  const { groups, order, settings, virtualCollapsed, showAllDone } = input;

  const rowsByGroup = new Map<string, Row[]>();
  for (const group of groups) rowsByGroup.set(group.id, []);
  rowsByGroup.set(UNSORTED_GROUP_ID, []);
  rowsByGroup.set(DONE_GROUP_ID, []);

  for (const task of input.tasks) {
    if (task.status === 'cancelled' && !settings.showCancelled) continue;
    const { groupId, conflicts } = assignGroup(task, groups);
    rowsByGroup.get(groupId)?.push({ task, ...rankOf(task, order), conflicts });
  }

  const activeCompare = compareActive(settings.fallbackSort);
  const openSections: Section[] = orderedGroups(groups).map((group) =>
    activeSection(group.id, group.label, 'group', group.collapsed, rowsByGroup, activeCompare),
  );
  openSections.push(
    activeSection(
      UNSORTED_GROUP_ID,
      'Unsorted',
      'unsorted',
      virtualCollapsed.unsorted,
      rowsByGroup,
      activeCompare,
    ),
  );

  return [
    ...openSections,
    doneSection(rowsByGroup.get(DONE_GROUP_ID) ?? [], virtualCollapsed.done, settings, showAllDone),
  ];
}

function rankOf(task: Task, order: Record<string, number>): { rank?: number } {
  if (task.blockId === undefined) return {};
  const rank = order[task.blockId];
  return rank === undefined ? {} : { rank };
}

function activeSection(
  id: string,
  label: string,
  kind: SectionKind,
  collapsed: boolean,
  rowsByGroup: Map<string, Row[]>,
  compare: (a: Row, b: Row) => number,
): Section {
  const rows = (rowsByGroup.get(id) ?? []).sort(compare);
  return { id, label, kind, collapsed, count: rows.length, rows, hidden: 0, overCap: false };
}

function doneSection(
  rows: Row[],
  collapsed: boolean,
  settings: Settings,
  showAllDone: boolean,
): Section {
  const sorted = rows.sort(compareDone);
  const cap = Math.max(settings.doneSectionLimit, 0);
  const limit = showAllDone ? sorted.length : cap;
  const shown = sorted.slice(0, limit);

  return {
    id: DONE_GROUP_ID,
    label: 'Done',
    kind: 'done',
    collapsed,
    count: sorted.length,
    rows: shown,
    dateGroups: byCompletionDate(shown),
    hidden: sorted.length - shown.length,
    overCap: sorted.length > cap,
  };
}

// ── sorting ──

/**
 * Ranked tasks first, in rank order, then unranked by the fallback sort. A manual
 * ordering always outranks a computed one: DESIGN.md section 6.4.
 */
function compareActive(fallbackSort: Settings['fallbackSort']): (a: Row, b: Row) => number {
  return (a, b) => {
    if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
    if (a.rank !== undefined) return -1;
    if (b.rank !== undefined) return 1;

    const primary = compareByFallback(fallbackSort, a.task, b.task);
    if (primary !== 0) return primary;
    return compareByDue(a.task, b.task) || compareByPosition(a.task, b.task);
  };
}

function compareByFallback(
  fallbackSort: Settings['fallbackSort'],
  a: Task,
  b: Task,
): number {
  if (fallbackSort === 'priority') return a.priority - b.priority;
  if (fallbackSort === 'due') return compareByDue(a, b);
  return compareByPosition(a, b);
}

function compareByDue(a: Task, b: Task): number {
  return compareDatesAscending(a.dates.due, b.dates.due);
}

/** Code-unit order on the path, matching how `TaskIndex.snapshot` sorts its files. */
function compareByPosition(a: Task, b: Task): number {
  if (a.file === b.file) return a.line - b.line;
  return a.file < b.file ? -1 : 1;
}

/** Undated sorts last, whichever direction the dated tasks run in. */
function compareDatesAscending(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a < b ? -1 : 1;
}

function compareDone(a: Row, b: Row): number {
  const left = completionDate(a.task);
  const right = completionDate(b.task);
  if (left !== right) {
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    return left < right ? 1 : -1;
  }
  return compareByPosition(a.task, b.task);
}

/** A cancelled task is dated by its cancellation. DESIGN.md section 4.4. */
function completionDate(task: Task): string | undefined {
  return task.status === 'cancelled' ? task.dates.cancelled : task.dates.done;
}

function byCompletionDate(rows: readonly Row[]): DoneDateGroup[] {
  const groups: DoneDateGroup[] = [];
  for (const row of rows) {
    const date = completionDate(row.task);
    const last = groups.at(-1);
    if (last && last.date === date) {
      last.rows.push(row);
      continue;
    }
    groups.push({
      ...(date === undefined ? {} : { date }),
      label: date ?? NO_DONE_DATE_LABEL,
      rows: [row],
    });
  }
  return groups;
}
