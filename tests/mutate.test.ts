import { describe, expect, it } from 'vitest';
import { nextPriority, setDate, setPriority, setStatus, toISODate } from '../src/model/mutate';
import { parseTaskLine } from '../src/model/parse';
import { serialiseTask } from '../src/model/serialise';
import { NORMAL_PRIORITY, type Priority, type Task } from '../src/model/types';
import { corpusLines } from './corpus';

/**
 * Each mutation changes only what it should, per DESIGN.md section 5.4.
 *
 * Mutations work by editing `task.layout`, never by rebuilding a line from the
 * scalar fields, so everything they do not touch comes back byte for byte. The
 * corpus properties at the end of this file are what prove that: every mutation
 * applied to every corpus line, then inverted, must return the original bytes.
 */
function parse(line: string, file = 'Inbox.md'): Task {
  const task = parseTaskLine(line, { file });
  if (!task) throw new Error(`expected a task, got null for: ${line}`);
  return task;
}

function must(task: Task | null): Task {
  if (!task) throw new Error('mutation was refused');
  return task;
}

const TODAY = '2026-07-29';

describe('setStatus', () => {
  it('completes an open task', () => {
    const task = must(setStatus(parse('- [ ] Draft the crew note'), 'done', TODAY));
    expect(task.status).toBe('done');
    expect(serialiseTask(task)).toBe('- [x] Draft the crew note ✅ 2026-07-29');
  });

  it('completes without a date when the setting is off', () => {
    const task = must(setStatus(parse('- [ ] Draft the crew note'), 'done'));
    expect(serialiseTask(task)).toBe('- [x] Draft the crew note');
    expect(task.dates.done).toBeUndefined();
  });

  it('replaces an existing done date rather than adding a second', () => {
    const task = must(setStatus(parse('- [x] Draft the crew note ✅ 2026-07-24'), 'done', TODAY));
    expect(serialiseTask(task)).toBe('- [x] Draft the crew note ✅ 2026-07-29');
  });

  it('leaves lane tags alone, so a completed task stays attributable', () => {
    const task = must(setStatus(parse('- [ ] Draft the crew note #focus #crew'), 'done', TODAY));
    expect(task.tags).toEqual(['focus', 'crew']);
  });

  it('uncompletes a task, removing the done date', () => {
    const task = must(setStatus(parse('- [x] Draft the crew note ✅ 2026-07-24'), 'open'));
    expect(task.status).toBe('open');
    expect(serialiseTask(task)).toBe('- [ ] Draft the crew note');
  });

  it('uncompletes an upper-case X, which Obsidian also reads as done', () => {
    const task = must(setStatus(parse('- [X] Draft the crew note'), 'open'));
    expect(serialiseTask(task)).toBe('- [ ] Draft the crew note');
  });

  it('leaves a cancelled date alone when uncompleting', () => {
    const task = must(setStatus(parse('- [x] Draft the crew note ❌ 2026-07-24'), 'open'));
    expect(serialiseTask(task)).toBe('- [ ] Draft the crew note ❌ 2026-07-24');
  });

  it('keeps the list marker character the line already used', () => {
    expect(serialiseTask(must(setStatus(parse('* [ ] Draft the crew note'), 'done')))).toBe(
      '* [x] Draft the crew note',
    );
  });

  it('refuses a task that does not round-trip', () => {
    const task = { ...parse('- [ ] Draft the crew note'), roundTrips: false };
    expect(setStatus(task, 'done', TODAY)).toBeNull();
  });

  it('changes nothing else on a fully loaded line', () => {
    const line =
      '- [ ] 12. Chase Marek: edge caching, registry contact #atlas/docs 🔼 📅 2026-07-20 🔗 [[Atlas/Migration]] ^tm-1a';
    const task = must(setStatus(parse(line), 'done', TODAY));
    expect(serialiseTask(task)).toBe(
      '- [x] 12. Chase Marek: edge caching, registry contact #atlas/docs 🔼 📅 2026-07-20 ✅ 2026-07-29 🔗 [[Atlas/Migration]] ^tm-1a',
    );
    expect(task.blockId).toBe('tm-1a');
    expect(task.priority).toBe(2);
    expect(task.dates.due).toBe('2026-07-20');
    expect(task.contextLinks).toHaveLength(1);
  });
});

describe('setPriority', () => {
  it('inserts a glyph where there was none', () => {
    const task = must(setPriority(parse('- [ ] Draft the crew note'), 1));
    expect(task.priority).toBe(1);
    expect(serialiseTask(task)).toBe('- [ ] Draft the crew note ⏫');
  });

  it('replaces an existing glyph in place', () => {
    const task = must(setPriority(parse('- [ ] Draft the crew note 🔼 #crew'), 0));
    expect(serialiseTask(task)).toBe('- [ ] Draft the crew note 🔺 #crew');
  });

  it('removes the glyph when set to normal', () => {
    const task = must(setPriority(parse('- [ ] Draft the crew note ⏬'), NORMAL_PRIORITY));
    expect(task.priority).toBe(NORMAL_PRIORITY);
    expect(serialiseTask(task)).toBe('- [ ] Draft the crew note');
  });

  it('adds nothing when set to normal on a task that has no glyph', () => {
    const line = '- [ ] Draft the crew note #crew';
    expect(serialiseTask(must(setPriority(parse(line), NORMAL_PRIORITY)))).toBe(line);
  });

  it('leaves a second glyph on a line that carries two, since the first one is what parses', () => {
    const task = must(setPriority(parse('- [ ] Draft the crew note 🔼 ⏬'), 0));
    expect(serialiseTask(task)).toBe('- [ ] Draft the crew note 🔺 ⏬');
    expect(task.priority).toBe(0);
  });

  it('removes every glyph when set to normal, so the parse really reads normal', () => {
    const task = must(setPriority(parse('- [ ] Draft the crew note 🔼 ⏬'), NORMAL_PRIORITY));
    expect(serialiseTask(task)).toBe('- [ ] Draft the crew note');
    expect(task.priority).toBe(NORMAL_PRIORITY);
  });

  it('refuses a task that does not round-trip', () => {
    const task = { ...parse('- [ ] Draft the crew note'), roundTrips: false };
    expect(setPriority(task, 0)).toBeNull();
  });
});

describe('setDate', () => {
  it('inserts a due date where there was none', () => {
    const task = must(setDate(parse('- [ ] Draft the crew note #crew'), 'due', '2026-08-01'));
    expect(task.dates.due).toBe('2026-08-01');
    expect(serialiseTask(task)).toBe('- [ ] Draft the crew note 📅 2026-08-01 #crew');
  });

  it('replaces a due date, keeping the spacing the line used', () => {
    const task = must(setDate(parse('- [ ] Draft the crew note 📅  2026-07-20'), 'due', '2026-08-01'));
    expect(serialiseTask(task)).toBe('- [ ] Draft the crew note 📅  2026-08-01');
  });

  it('clears a due date', () => {
    const task = must(setDate(parse('- [ ] Draft the crew note 📅 2026-07-20 #crew'), 'due', null));
    expect(task.dates.due).toBeUndefined();
    expect(serialiseTask(task)).toBe('- [ ] Draft the crew note #crew');
  });

  it('leaves the other dates alone', () => {
    const line = '- [x] Draft the crew note 🛫 2026-07-01 📅 2026-07-20 ✅ 2026-07-24';
    const task = must(setDate(parse(line), 'due', null));
    expect(serialiseTask(task)).toBe('- [x] Draft the crew note 🛫 2026-07-01 ✅ 2026-07-24');
    expect(task.dates.start).toBe('2026-07-01');
    expect(task.dates.done).toBe('2026-07-24');
  });

  it('clears every occurrence when a line repeats a glyph', () => {
    const task = must(setDate(parse('- [ ] Draft the note 📅 2026-07-20 📅 2026-07-21'), 'due', null));
    expect(serialiseTask(task)).toBe('- [ ] Draft the note');
  });

  it('replaces only the first occurrence when a line repeats a glyph', () => {
    const task = must(
      setDate(parse('- [ ] Draft the note 📅 2026-07-20 📅 2026-07-21'), 'due', '2026-08-01'),
    );
    expect(serialiseTask(task)).toBe('- [ ] Draft the note 📅 2026-08-01 📅 2026-07-21');
  });

  it('clearing a date the line does not carry changes nothing', () => {
    const line = '- [ ] Draft the crew note #crew';
    expect(serialiseTask(must(setDate(parse(line), 'due', null)))).toBe(line);
  });

  it('refuses a task that does not round-trip', () => {
    const task = { ...parse('- [ ] Draft the crew note'), roundTrips: false };
    expect(setDate(task, 'due', '2026-08-01')).toBeNull();
  });

  it.each(['tomorrow', '', '2026-8-1', '2026-08-01 ', 'x2026-08-01'])(
    'refuses %o rather than writing a date the parser will not read back',
    (value) => {
      // Phase 8's raw editor and the date hotkeys will both call this with whatever
      // they were given. A dangling glyph round-trips, so `rebuild` would not catch it.
      expect(setDate(parse('- [ ] Draft the crew note'), 'due', value)).toBeNull();
    },
  );

  it('accepts an impossible calendar date, which Obsidian Tasks also stores verbatim', () => {
    // The check is the shape, not the calendar: refusing 2026-02-30 would mean this
    // module deciding what a date means, which is the Tasks plugin's business.
    expect(serialiseTask(must(setDate(parse('- [ ] Note'), 'due', '2026-02-30')))).toBe(
      '- [ ] Note 📅 2026-02-30',
    );
  });
});

describe('nextPriority', () => {
  it('cycles in order of urgency, starting from normal', () => {
    const seen: Priority[] = [];
    let priority: Priority = NORMAL_PRIORITY;
    for (let i = 0; i < 6; i += 1) {
      priority = nextPriority(priority);
      seen.push(priority);
    }
    expect(seen).toEqual([0, 1, 2, 4, 5, NORMAL_PRIORITY]);
  });
});

describe('toISODate', () => {
  it('formats a local date, not a UTC one', () => {
    // 23:30 local on the 29th is the 30th in UTC through most of the year. A done
    // date stamped in UTC would read as tomorrow for anything Jon ticks at night.
    expect(toISODate(new Date(2026, 6, 29, 23, 30))).toBe('2026-07-29');
  });

  it('pads the month and the day', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

/**
 * The mutation half of the round-trip guarantee: every corpus line, mutated and
 * then put back, must come out byte for byte. This is what proves mutation goes
 * through the layout rather than rebuilding the line from the scalar fields.
 */
describe('the corpus, mutated and inverted', () => {
  const lines = corpusLines().map((line) => ({ line, task: parse(line) }));

  const glyphCount = (task: Task, kind: Task['layout'][number]['kind']): number =>
    task.layout.filter((segment) => segment.kind === kind).length;

  it('has a corpus where every line round-trips, or the rest of this proves nothing', () => {
    expect(lines.filter(({ task }) => !task.roundTrips)).toEqual([]);
  });

  for (const { line, task } of lines) {
    // A line carrying the same token twice cannot be inverted: setting a priority
    // and putting it back leaves one glyph where there were two. Those lines are
    // covered by their own cases above.
    if (glyphCount(task, 'priority') > 1) continue;

    it(`priority set and restored returns the original: ${line}`, () => {
      const changed = must(setPriority(task, task.priority === 0 ? 5 : 0));
      expect(serialiseTask(must(setPriority(changed, task.priority)))).toBe(line);
    });
  }

  for (const { line, task } of lines) {
    if (task.layout.filter((s) => s.kind === 'date' && s.dateKind === 'due').length > 1) continue;

    it(`due date set and restored returns the original: ${line}`, () => {
      const changed = must(setDate(task, 'due', '2026-08-01'));
      expect(serialiseTask(must(setDate(changed, 'due', task.dates.due ?? null)))).toBe(line);
    });
  }

  for (const { line, task } of lines) {
    if (task.status !== 'open' || task.dates.done !== undefined) continue;

    it(`completed and uncompleted returns the original: ${line}`, () => {
      const done = must(setStatus(task, 'done', TODAY));
      expect(serialiseTask(done)).toContain('✅ 2026-07-29');
      expect(serialiseTask(must(setStatus(done, 'open')))).toBe(line);
    });
  }

  it('never lets a mutation change more than the tokens it targets', () => {
    for (const { task } of lines) {
      const before = serialiseTask(task);
      const priorities: Priority[] = [0, 1, 2, NORMAL_PRIORITY, 4, 5];
      for (const priority of priorities) {
        const changed = must(setPriority(task, priority));
        // Only the priority glyph may differ: with every glyph stripped from both
        // sides the two lines must be identical.
        expect(strip(serialiseTask(changed))).toBe(strip(before));
      }
    }
  });
});

/** Every priority glyph and the space before it, so two lines can be compared without them. */
function strip(line: string): string {
  return line.replace(/ ?[🔺⏫🔼🔽⏬]/gu, '');
}
