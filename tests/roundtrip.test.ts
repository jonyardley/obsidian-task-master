import { describe, expect, it } from 'vitest';
import { parseTaskLine } from '../src/model/parse';
import { serialiseTask } from '../src/model/serialise';
import { corpusLines } from './corpus';

/**
 * The corpus test. DESIGN.md section 4.3:
 *
 *   "This is the most important correctness property in the system."
 *
 * One assertion per line, so a failure names the offending line rather than
 * reporting that something, somewhere, in 105 lines is wrong.
 */
describe('round-trip over the live vault corpus', () => {
  const lines = corpusLines();

  lines.forEach((line, i) => {
    it(`line ${i + 1} round-trips: ${JSON.stringify(line.slice(0, 60))}`, () => {
      const task = parseTaskLine(line);
      expect(task).not.toBeNull();
      expect(serialiseTask(task!)).toBe(line);
    });
  });

  it('parses every corpus line as a task', () => {
    expect(lines.filter((line) => parseTaskLine(line) === null)).toEqual([]);
  });

  it('reports roundTrips true for every corpus line', () => {
    expect(lines.filter((line) => parseTaskLine(line)?.roundTrips !== true)).toEqual([]);
  });

  it('covers every character of every line with layout segments', () => {
    // A gap or overlap in the layout is the failure mode that would make
    // serialisation lossy, so assert coverage directly rather than inferring it.
    const failures = lines.filter((line) => {
      const task = parseTaskLine(line);
      return task?.layout.map((s) => s.text).join('') !== line;
    });
    expect(failures).toEqual([]);
  });
});
