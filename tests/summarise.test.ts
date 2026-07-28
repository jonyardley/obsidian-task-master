import { describe, expect, it } from 'vitest';
import { parseTaskLine } from '../src/model/parse';
import { summariseTasks } from '../src/model/summarise';
import type { Task } from '../src/model/types';

/**
 * The summary behind the dev command in PLAN.md phase 2, whose numbers are the
 * phase 2 gate. Pure, so the counting is tested here and only the logging is
 * left to the manual check.
 */
function parse(line: string, file: string): Task {
  const task = parseTaskLine(line, { file });
  if (!task) throw new Error(`expected a task, got null for: ${line}`);
  return task;
}

const TASKS: Task[] = [
  parse('- [ ] Open one #atlas #focus', 'Daily Notes/2026-07-28.md'),
  parse('- [ ] Open two #atlas/docs', 'Daily Notes/2026-07-28.md'),
  parse('- [x] Done one #atlas ✅ 2026-07-24', 'Projects/Atlas.md'),
];

describe('summariseTasks', () => {
  it('counts every task', () => {
    expect(summariseTasks(TASKS).total).toBe(3);
  });

  it('counts by status', () => {
    expect(summariseTasks(TASKS).byStatus).toEqual({ open: 2, done: 1 });
  });

  it('omits statuses that no task carries', () => {
    // The dump should not claim "cancelled: 0" for a vault with no cancellations.
    expect(summariseTasks(TASKS).byStatus).not.toHaveProperty('cancelled');
  });

  it('counts each tag once per task carrying it', () => {
    expect(summariseTasks(TASKS).byTag).toEqual({
      atlas: 2,
      'atlas/docs': 1,
      focus: 1,
    });
  });

  it('counts by file', () => {
    expect(summariseTasks(TASKS).byFile).toEqual({
      'Daily Notes/2026-07-28.md': 2,
      'Projects/Atlas.md': 1,
    });
  });

  it('counts a tag once even when a task repeats it', () => {
    const repeated = [parse('- [ ] Task #atlas #atlas', 'a.md')];
    expect(summariseTasks(repeated).byTag).toEqual({ atlas: 1 });
  });

  it('rolls a nested tag up into its parent', () => {
    // The phase 2 and 3 gates are stated as "#atlas or one of its subtags", so
    // the rollup has to be in the summary rather than counted by hand.
    const nested = [parse('- [ ] Task #atlas/docs', 'a.md')];
    expect(summariseTasks(nested).byTagWithSubtags).toEqual({
      atlas: 1,
      'atlas/docs': 1,
    });
  });

  it('does not double-count a parent a task carries directly as well', () => {
    const both = [parse('- [ ] Task #atlas #atlas/docs', 'a.md')];
    expect(summariseTasks(both).byTagWithSubtags).toEqual({
      atlas: 1,
      'atlas/docs': 1,
    });
  });

  it('returns empty counts for no tasks', () => {
    expect(summariseTasks([])).toEqual({
      total: 0,
      byStatus: {},
      byTag: {},
      byTagWithSubtags: {},
      byFile: {},
    });
  });
});
