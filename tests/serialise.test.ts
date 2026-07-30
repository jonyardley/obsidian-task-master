import { describe, expect, it } from 'vitest';
import { setDate, setPriority, setStatus } from '../src/model/mutate';
import { parseTaskLine } from '../src/model/parse';
import { serialiseTask } from '../src/model/serialise';
import type { Task } from '../src/model/types';

/**
 * The serialisation rules in DESIGN.md section 4.3: canonical insertion order for
 * a token that was absent, and whitespace handling when one is removed.
 *
 * `serialiseTask` itself is a concatenation of the layout, which
 * `roundtrip.test.ts` covers line by line. What is worth testing here is where a
 * mutation puts a token it had to invent, since that is the only point at which
 * the plugin decides a line's shape rather than preserving it.
 */
function parse(line: string): Task {
  const task = parseTaskLine(line, { file: 'Inbox.md' });
  if (!task) throw new Error(`expected a task, got null for: ${line}`);
  return task;
}

function must(task: Task | null): string {
  if (!task) throw new Error('mutation was refused');
  return serialiseTask(task);
}

describe('canonical insertion order, DESIGN.md 4.3 rule 2', () => {
  it('appends to a line carrying no metadata at all', () => {
    expect(must(setPriority(parse('- [ ] Draft the crew note'), 0))).toBe(
      '- [ ] Draft the crew note 🔺',
    );
  });

  it('puts a priority before the tags', () => {
    expect(must(setPriority(parse('- [ ] Draft the crew note #atlas/docs'), 2))).toBe(
      '- [ ] Draft the crew note 🔼 #atlas/docs',
    );
  });

  it('puts a priority before a due date, because priority is first in the order', () => {
    expect(must(setPriority(parse('- [ ] Draft the crew note 📅 2026-07-20'), 1))).toBe(
      '- [ ] Draft the crew note ⏫ 📅 2026-07-20',
    );
  });

  it('puts a due date after a priority and before the tags', () => {
    expect(must(setDate(parse('- [ ] Draft the crew note 🔼 #atlas/docs'), 'due', '2026-08-01'))).toBe(
      '- [ ] Draft the crew note 🔼 📅 2026-08-01 #atlas/docs',
    );
  });

  it('puts a due date before a done date', () => {
    expect(must(setDate(parse('- [x] Draft the crew note ✅ 2026-07-24'), 'due', '2026-07-20'))).toBe(
      '- [x] Draft the crew note 📅 2026-07-20 ✅ 2026-07-24',
    );
  });

  it('puts a done date after a due date and before the tags', () => {
    expect(
      must(setStatus(parse('- [ ] Draft the crew note 📅 2026-07-20 #crew'), 'done', '2026-07-29')),
    ).toBe('- [x] Draft the crew note 📅 2026-07-20 ✅ 2026-07-29 #crew');
  });

  it('puts a due date before a `🔗` run', () => {
    expect(
      must(setDate(parse('- [ ] Draft the crew note 🔗 [[Atlas/Migration]]'), 'due', '2026-08-01')),
    ).toBe('- [ ] Draft the crew note 📅 2026-08-01 🔗 [[Atlas/Migration]]');
  });

  it('puts a due date before a preserved token, since recurrence follows the dates', () => {
    expect(must(setDate(parse('- [ ] Water the plants 🔁 every week'), 'due', '2026-08-01'))).toBe(
      '- [ ] Water the plants 📅 2026-08-01 🔁 every week',
    );
  });

  it('keeps the block ID last', () => {
    expect(must(setPriority(parse('- [ ] Draft the crew note ^tm-1a'), 0))).toBe(
      '- [ ] Draft the crew note 🔺 ^tm-1a',
    );
  });

  it('keeps the block ID last when every other token is already present', () => {
    expect(
      must(setStatus(parse('- [ ] Tidy the seed data #atlas 📅 2026-07-20 ^b0q4i3'), 'done', '2026-07-29')),
    ).toBe('- [x] Tidy the seed data #atlas 📅 2026-07-20 ✅ 2026-07-29 ^b0q4i3');
  });

  it('appends after the last canonically earlier token rather than jumping ahead of a later one', () => {
    // The line is already out of canonical order: the tag precedes the due date.
    // Inserting the done date immediately before the first canonically later token
    // would put it ahead of the due date it must follow, so the anchor is the due
    // date and the insertion lands at the end. This is the shape Obsidian Tasks
    // leaves behind, and the dominant one among the vault's completed lines.
    expect(
      must(setStatus(parse('- [ ] Tidy the seed data #atlas 📅 2026-07-20'), 'done', '2026-07-29')),
    ).toBe('- [x] Tidy the seed data #atlas 📅 2026-07-20 ✅ 2026-07-29');
  });

  it('inserts before trailing whitespace rather than after it', () => {
    expect(must(setPriority(parse('- [ ] Draft the crew note  '), 0))).toBe(
      '- [ ] Draft the crew note 🔺  ',
    );
  });

  it('keeps the indentation of a nested task', () => {
    expect(must(setPriority(parse('  - [ ] Sketch the empty state'), 4))).toBe(
      '  - [ ] Sketch the empty state 🔽',
    );
  });
});

describe('token removal, DESIGN.md 4.3 rule 3', () => {
  it('removes exactly one adjoining space with the token', () => {
    expect(must(setPriority(parse('- [ ] Draft the crew note 🔼 #crew'), 3))).toBe(
      '- [ ] Draft the crew note #crew',
    );
  });

  it('leaves the rest of a run of spaces alone', () => {
    expect(must(setPriority(parse('- [ ] Draft the crew note   🔼 #crew'), 3))).toBe(
      '- [ ] Draft the crew note   #crew',
    );
  });

  it('removes a trailing token and the space before it', () => {
    expect(must(setDate(parse('- [ ] Draft the crew note 📅 2026-07-20'), 'due', null))).toBe(
      '- [ ] Draft the crew note',
    );
  });

  it('leaves one space after the checkbox when the removed token led the body', () => {
    expect(must(setPriority(parse('- [ ] 🔺 Draft the crew note'), 3))).toBe(
      '- [ ] Draft the crew note',
    );
  });

  it('never reflows the description around a removed token', () => {
    const line = '- [ ] Draft   the  crew note 🔼 #crew';
    expect(must(setPriority(parse(line), 3))).toBe('- [ ] Draft   the  crew note #crew');
  });
});
