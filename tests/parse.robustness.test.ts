import { describe, expect, it } from 'vitest';
import { parseTaskLine } from '../src/model/parse';
import { serialiseTask } from '../src/model/serialise';
import { corpusLines } from './corpus';

/**
 * The parser runs over Jon's real notes, and a line it mangles is worse than a
 * line it refuses. DESIGN.md section 4.3:
 *
 *   "A parser that silently mangles a line Jon wrote is worse than a parser that
 *    admits defeat."
 *
 * These suites derive a large space of malformed input from the real corpus and
 * assert the two invariants that matter on all of it: never throw, and never
 * lose a byte. Nothing here asserts that a mangled line is *understood*, only
 * that it survives.
 */
describe('robustness over derived malformed input', () => {
  const lines = corpusLines();

  let parsed = 0;
  let examined = 0;

  function check(input: string): string | null {
    examined += 1;
    const task = parseTaskLine(input);
    if (task === null) return null;
    parsed += 1;
    const out = serialiseTask(task);
    return out === input ? null : `${JSON.stringify(input)} -> ${JSON.stringify(out)}`;
  }

  it('never throws and never loses bytes on any prefix of any corpus line', () => {
    const failures: string[] = [];
    for (const line of lines) {
      for (let end = 0; end <= line.length; end += 1) {
        const failure = check(line.slice(0, end));
        if (failure) failures.push(failure);
      }
    }
    expect(failures).toEqual([]);
  });

  it('never throws and never loses bytes with any single character deleted', () => {
    const failures: string[] = [];
    for (const line of lines) {
      for (let i = 0; i < line.length; i += 1) {
        const failure = check(line.slice(0, i) + line.slice(i + 1));
        if (failure) failures.push(failure);
      }
    }
    expect(failures).toEqual([]);
  });

  it('never throws and never loses bytes with a token glyph injected at any position', () => {
    // Glyph soup is the shape most likely to confuse a scanner that reads emoji
    // by code unit, so inject one of each class at every offset.
    const failures: string[] = [];
    for (const glyph of ['🔺', '📅', '🔗', '🔁', '#', '^', '[[', '](']) {
      for (const line of lines) {
        for (let i = 0; i <= line.length; i += 1) {
          const failure = check(line.slice(0, i) + glyph + line.slice(i));
          if (failure) failures.push(failure);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('never throws and never loses bytes on adversarial hand-written lines', () => {
    const nasty = [
      '- [ ]',
      '- [ ] ',
      '- [ ]  ^',
      '- [ ] ^',
      '- [ ] ^^^',
      '- [ ] #',
      '- [ ] ##',
      '- [ ] #/',
      '- [ ] #//#//',
      '- [ ] 🔗',
      '- [ ] 🔗 ',
      '- [ ] 🔗 [[',
      '- [ ] 🔗 [[]]',
      '- [ ] 🔗 [[]] · ',
      '- [ ] 🔗 [[a]] · [[b]] · [[c]] · [[d]]',
      '- [ ] 🔗 [](',
      '- [ ] 🔗 []()',
      '- [ ] 🔗 [a](b',
      '- [ ] 🔗 [[a]] ·  [[b]]',
      '- [ ] 🔗 [[a]]·[[b]]',
      '- [ ] 📅',
      '- [ ] 📅 ',
      '- [ ] 📅 2026',
      '- [ ] 📅 2026-13-45',
      '- [ ] 📅 2026-07-28 📅 2026-07-29',
      '- [ ] 🔁',
      '- [ ] 🔁 🔁 🔁',
      '- [ ] 🆔 🆔 🆔',
      '- [ ] 🔁 every day 🆔 a ⛔ b 🔗 [[c]] #d ⏫ 📅 2026-07-28 ^e',
      '- [ ] 🔺⏫🔼🔽⏬',
      '- [ ] 🔺 ⏫ 🔼 🔽 ⏬',
      '- [ ] \t\ttabs\t\tbetween\t\twords\t\t',
      '- [ ] [[unclosed wikilink #tag 📅 2026-07-28',
      '- [ ] emoji in text 😀 🎹 🔗 [[a]]',
      '\t\t\t- [x] deeply indented ✅ 2026-07-28 ^tm-zz',
      '- [🔺] glyph as a status char',
      '- [ ] trailing separator 🔗 [[a]] · ',
    ];
    const failures = nasty.map(check).filter((f): f is string => f !== null);
    expect(failures).toEqual([]);
  });

  it('actually exercised the parser rather than passing vacuously', () => {
    // Without this, a regression that made every input unparseable would turn
    // every suite above green: check() returns null both for "refused" and for
    // "round-tripped". Runs last, so the counters are complete.
    expect(examined).toBeGreaterThan(100_000);
    expect(parsed / examined).toBeGreaterThan(0.9);
  });
});
