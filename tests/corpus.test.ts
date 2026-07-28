import { describe, expect, it } from 'vitest';
import { corpusLines, EXPECTED_CORPUS_SIZE } from './corpus';

/**
 * Guards the fixture itself. Every later suite reads through corpusLines(), so a
 * silently truncated or reformatted corpus would weaken those suites without
 * failing them.
 */
describe('vault corpus fixture', () => {
  const lines = corpusLines();

  it(`holds ${EXPECTED_CORPUS_SIZE} lines`, () => {
    expect(lines).toHaveLength(EXPECTED_CORPUS_SIZE);
  });

  it('holds only task lines', () => {
    const notTasks = lines.filter((line) => !/^\s*- \[.\] /.test(line));
    expect(notTasks).toEqual([]);
  });

  it('preserves leading indentation verbatim', () => {
    expect(lines.some((line) => line.startsWith(' '))).toBe(true);
  });

  it('holds no duplicates', () => {
    expect(new Set(lines).size).toBe(lines.length);
  });
});
