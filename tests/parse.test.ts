import { describe, expect, it } from 'vitest';
import { parseTaskLine } from '../src/model/parse';
import { serialiseTask } from '../src/model/serialise';
import type { Priority, Task } from '../src/model/types';
import { corpusLines } from './corpus';

function parse(line: string): Task {
  const task = parseTaskLine(line);
  if (!task) throw new Error(`expected a task, got null for: ${line}`);
  return task;
}

describe('list markers and status', () => {
  it.each([
    ['- [ ] Open', ' ', 'open'],
    ['- [x] Done lower', 'x', 'done'],
    ['- [X] Done upper', 'X', 'done'],
    ['- [-] Cancelled', '-', 'cancelled'],
    ['- [/] In progress', '/', 'custom'],
    ['- [?] Question', '?', 'custom'],
    ['- [>] Forwarded', '>', 'custom'],
  ])('%s parses status %s as %s', (line, statusChar, status) => {
    const task = parse(line);
    expect(task.statusChar).toBe(statusChar);
    expect(task.status).toBe(status);
    expect(serialiseTask(task)).toBe(line);
  });

  it.each(['- [ ] Dash', '* [ ] Star', '+ [ ] Plus'])('accepts the list marker in %s', (line) => {
    expect(parse(line).description).toMatch(/^(Dash|Star|Plus)$/);
    expect(serialiseTask(parse(line))).toBe(line);
  });

  it('preserves indentation verbatim and exposes it', () => {
    const task = parse('\t  - [ ] Nested');
    expect(task.indent).toBe('\t  ');
    expect(serialiseTask(task)).toBe('\t  - [ ] Nested');
  });

  it('preserves unusual whitespace between the marker and the checkbox', () => {
    const line = '-   [ ]   Spaced out';
    expect(serialiseTask(parse(line))).toBe(line);
  });

  it.each([
    ['plain prose', 'Just some text'],
    ['a non-task list item', '- Not a task'],
    ['an unclosed checkbox', '- [ Not a task'],
    ['a heading', '## Heading'],
    ['an empty line', ''],
  ])('returns null for %s', (_label, line) => {
    expect(parseTaskLine(line)).toBeNull();
  });
});

describe('priority', () => {
  it.each([
    ['🔺', 0],
    ['⏫', 1],
    ['🔼', 2],
    ['🔽', 4],
    ['⏬', 5],
  ] as ReadonlyArray<readonly [string, Priority]>)('reads %s as %i', (glyph, priority) => {
    const line = `- [ ] Task ${glyph}`;
    const task = parse(line);
    expect(task.priority).toBe(priority);
    expect(task.description).toBe('Task');
    expect(serialiseTask(task)).toBe(line);
  });

  it('defaults to normal when no glyph is present', () => {
    expect(parse('- [ ] Task').priority).toBe(3);
  });

  it('takes the first glyph when a line carries two, and still round-trips', () => {
    const line = '- [ ] Task ⏫ 🔽';
    const task = parse(line);
    expect(task.priority).toBe(1);
    expect(serialiseTask(task)).toBe(line);
  });

  it('does not read a glyph that is not at a whitespace boundary', () => {
    const line = '- [ ] Task⏫';
    const task = parse(line);
    expect(task.priority).toBe(3);
    expect(task.description).toBe('Task⏫');
    expect(serialiseTask(task)).toBe(line);
  });
});

describe('dates', () => {
  it.each([
    ['➕', 'created'],
    ['🛫', 'start'],
    ['⏳', 'scheduled'],
    ['📅', 'due'],
    ['✅', 'done'],
    ['❌', 'cancelled'],
  ] as ReadonlyArray<readonly [string, string]>)('reads %s as the %s date', (glyph, kind) => {
    const line = `- [ ] Task ${glyph} 2026-07-28`;
    const task = parse(line);
    expect(task.dates).toEqual({ [kind]: '2026-07-28' });
    expect(task.description).toBe('Task');
    expect(serialiseTask(task)).toBe(line);
  });

  it('reads every date on a line carrying all six', () => {
    const line = '- [ ] Task ➕ 2026-01-01 🛫 2026-02-02 ⏳ 2026-03-03 📅 2026-04-04 ✅ 2026-05-05 ❌ 2026-06-06';
    const task = parse(line);
    expect(task.dates).toEqual({
      created: '2026-01-01',
      start: '2026-02-02',
      scheduled: '2026-03-03',
      due: '2026-04-04',
      done: '2026-05-05',
      cancelled: '2026-06-06',
    });
    expect(serialiseTask(task)).toBe(line);
  });

  it('treats a date glyph with no well-formed date as description text', () => {
    const line = '- [ ] Task 📅 soon';
    const task = parse(line);
    expect(task.dates).toEqual({});
    expect(task.description).toBe('Task 📅 soon');
    expect(serialiseTask(task)).toBe(line);
  });

  it('treats a malformed date as description text', () => {
    const line = '- [ ] Task 📅 2026-7-8';
    const task = parse(line);
    expect(task.dates).toEqual({});
    expect(serialiseTask(task)).toBe(line);
  });

  it('tolerates extra whitespace between glyph and date', () => {
    const line = '- [ ] Task 📅   2026-07-28';
    const task = parse(line);
    expect(task.dates.due).toBe('2026-07-28');
    expect(serialiseTask(task)).toBe(line);
  });
});

describe('tags', () => {
  it('reads flat and nested tags without the leading hash', () => {
    const task = parse('- [ ] Task #crew #atlas/migration');
    expect(task.tags).toEqual(['crew', 'atlas/migration']);
    expect(task.description).toBe('Task');
  });

  it('parses a tag with a trailing slash without crashing', () => {
    // This shape appears in the vault. See PLAN.md phase 1.
    const line = '- [ ] Task #atlas/';
    const task = parse(line);
    expect(task.tags).toEqual(['atlas/']);
    expect(serialiseTask(task)).toBe(line);
  });

  it('does not treat a bare hash as a tag', () => {
    const line = '- [ ] Issue # 42 needs a look';
    const task = parse(line);
    expect(task.tags).toEqual([]);
    expect(task.description).toBe('Issue # 42 needs a look');
    expect(serialiseTask(task)).toBe(line);
  });

  it('does not treat an all-numeric fragment as a tag', () => {
    const task = parse('- [ ] Ticket #1234 is open');
    expect(task.tags).toEqual([]);
    expect(task.description).toBe('Ticket #1234 is open');
  });

  it('does not treat a URL fragment as a tag', () => {
    const line = '- [ ] Read https://example.com/docs#section-3 today';
    const task = parse(line);
    expect(task.tags).toEqual([]);
    expect(serialiseTask(task)).toBe(line);
  });

  it('keeps tag order as written', () => {
    expect(parse('- [ ] T #b #a #c').tags).toEqual(['b', 'a', 'c']);
  });
});

describe('the 🔗 context-link convention', () => {
  it('reads a wikilink with an alias', () => {
    const line = '- [ ] Task 🔗 [[Projects/Atlas/Migration|plan]]';
    const task = parse(line);
    expect(task.contextLinks).toEqual([
      { kind: 'wikilink', target: 'Projects/Atlas/Migration', alias: 'plan', isSource: false },
    ]);
    expect(task.description).toBe('Task');
    expect(serialiseTask(task)).toBe(line);
  });

  it('reads a wikilink with no alias', () => {
    const task = parse('- [ ] Task 🔗 [[Projects/Atlas/Docs]]');
    expect(task.contextLinks).toEqual([
      { kind: 'wikilink', target: 'Projects/Atlas/Docs', isSource: false },
    ]);
  });

  it('flags an alias of exactly "source" as provenance', () => {
    const task = parse('- [ ] Task 🔗 [[Meetings/2026-05-11 Crew Chats|source]]');
    expect(task.contextLinks[0]?.isSource).toBe(true);
  });

  it('reads a run of two links separated by " · "', () => {
    const line =
      '- [ ] Task 🔗 [[Projects/Atlas/Migration|plan]] · [[Meetings/2026-05-11 Crew Chats|source]]';
    const task = parse(line);
    expect(task.contextLinks).toHaveLength(2);
    expect(task.contextLinks[0]?.alias).toBe('plan');
    expect(task.contextLinks[1]?.isSource).toBe(true);
    expect(task.description).toBe('Task');
    expect(serialiseTask(task)).toBe(line);
  });

  it('reads a markdown external link', () => {
    const line = '- [ ] Task 🔗 [Thread](https://example.com/t/104877)';
    const task = parse(line);
    expect(task.contextLinks).toEqual([
      {
        kind: 'external',
        target: 'https://example.com/t/104877',
        alias: 'Thread',
        isSource: false,
      },
    ]);
    expect(serialiseTask(task)).toBe(line);
  });

  it('reads a run mixing an external link and a wikilink', () => {
    const line =
      '- [ ] Task 🔗 [Thread](https://example.com/x) · [[Meetings/2026-05-07 Otto - Sam|source]]';
    const task = parse(line);
    expect(task.contextLinks.map((l) => l.kind)).toEqual(['external', 'wikilink']);
    expect(task.contextLinks[1]?.isSource).toBe(true);
    expect(serialiseTask(task)).toBe(line);
  });

  it('stops the run at a token that is not a link', () => {
    const line = '- [ ] Task 🔗 [[Sean O\'Doherty]] #crew #this-week';
    const task = parse(line);
    expect(task.contextLinks).toHaveLength(1);
    expect(task.tags).toEqual(['crew', 'this-week']);
    expect(serialiseTask(task)).toBe(line);
  });

  it('treats a lone glyph with nothing link-shaped after it as description text', () => {
    const line = '- [ ] Task 🔗 nothing here';
    const task = parse(line);
    expect(task.contextLinks).toEqual([]);
    expect(task.description).toBe('Task 🔗 nothing here');
    expect(serialiseTask(task)).toBe(line);
  });
});

describe('inline wikilinks in the description', () => {
  it('keeps an inline wikilink in the description rather than treating it as context', () => {
    const line = '- [ ] Chase Milo to complete the review for [[Ada Fenwick]] #crew';
    const task = parse(line);
    expect(task.description).toBe('Chase Milo to complete the review for [[Ada Fenwick]]');
    expect(task.contextLinks).toEqual([]);
    expect(task.tags).toEqual(['crew']);
    expect(serialiseTask(task)).toBe(line);
  });

  it('keeps an aliased inline wikilink mid-sentence', () => {
    const line = '- [ ] Give Rafa, [[Bruno Adeyemi|Bruno]] and Devi a heads up #atlas/migration';
    const task = parse(line);
    expect(task.description).toBe('Give Rafa, [[Bruno Adeyemi|Bruno]] and Devi a heads up');
    expect(task.contextLinks).toEqual([]);
    expect(serialiseTask(task)).toBe(line);
  });

  it('keeps a description that opens with a wikilink', () => {
    const line = '- [ ] [[Ada Fenwick]]: reviews for Beacon & Wren ⏫ 📅 2026-07-03 #crew';
    const task = parse(line);
    expect(task.description).toBe('[[Ada Fenwick]]: reviews for Beacon & Wren');
    expect(task.priority).toBe(1);
    expect(serialiseTask(task)).toBe(line);
  });

  it('distinguishes inline wikilinks from a later 🔗 run on the same line', () => {
    const line =
      '- [ ] Complete Ravi\'s review and share feedback with [[Ada Fenwick]] #crew 🔗 [[Meetings/2026-05-08 Ada - Sam|source]]';
    const task = parse(line);
    expect(task.description).toBe("Complete Ravi's review and share feedback with [[Ada Fenwick]]");
    expect(task.contextLinks).toHaveLength(1);
    expect(task.contextLinks[0]?.target).toBe('Meetings/2026-05-08 Ada - Sam');
    expect(serialiseTask(task)).toBe(line);
  });
});

describe('metadata order independence', () => {
  // Both orderings appear in the vault. See DESIGN.md section 4.1.
  it('reads links before tags', () => {
    const line = '- [ ] Task 🔗 [[Projects/Atlas/Migration|plan]] #atlas/migration #today';
    const task = parse(line);
    expect(task.tags).toEqual(['atlas/migration', 'today']);
    expect(task.contextLinks).toHaveLength(1);
    expect(serialiseTask(task)).toBe(line);
  });

  it('reads tags before links', () => {
    const line = '- [ ] Task #atlas/migration #today 🔗 [[Projects/Atlas/Migration|plan]]';
    const task = parse(line);
    expect(task.tags).toEqual(['atlas/migration', 'today']);
    expect(task.contextLinks).toHaveLength(1);
    expect(serialiseTask(task)).toBe(line);
  });

  it('reads the same model from two different token orders', () => {
    const a = parse('- [ ] Task #crew 🔺 📅 2026-07-08');
    const b = parse('- [ ] Task 📅 2026-07-08 🔺 #crew');
    expect({ tags: a.tags, priority: a.priority, dates: a.dates }).toEqual({
      tags: b.tags,
      priority: b.priority,
      dates: b.dates,
    });
  });

  it('reads a done date positioned after the tags', () => {
    const line = '- [x] Task 📅 2026-07-16 🔗 [[Sean O\'Doherty]] #crew ✅ 2026-07-24';
    const task = parse(line);
    expect(task.dates).toEqual({ due: '2026-07-16', done: '2026-07-24' });
    expect(task.status).toBe('done');
    expect(serialiseTask(task)).toBe(line);
  });
});

describe('preserved tokens', () => {
  it('preserves a recurrence rule verbatim without interpreting it', () => {
    const line = '- [ ] Water the plants 🔁 every week on Sunday 📅 2026-07-28 #home';
    const task = parse(line);
    expect(task.preserved).toEqual(['🔁 every week on Sunday']);
    expect(task.dates.due).toBe('2026-07-28');
    expect(task.tags).toEqual(['home']);
    expect(task.description).toBe('Water the plants');
    expect(serialiseTask(task)).toBe(line);
  });

  it('preserves dependency tokens verbatim', () => {
    const line = '- [ ] Task 🆔 abc123 ⛔ def456,ghi789 #atlas';
    const task = parse(line);
    expect(task.preserved).toEqual(['🆔 abc123', '⛔ def456,ghi789']);
    expect(task.tags).toEqual(['atlas']);
    expect(serialiseTask(task)).toBe(line);
  });
});

describe('block IDs', () => {
  it('reads a trailing block ID and keeps it out of the description', () => {
    const line = '- [ ] Task #atlas/migration 📅 2026-07-23 ^loe1wz';
    const task = parse(line);
    expect(task.blockId).toBe('loe1wz');
    expect(task.id).toBe('loe1wz');
    expect(task.description).toBe('Task');
    expect(serialiseTask(task)).toBe(line);
  });

  it('reads a plugin-assigned block ID', () => {
    expect(parse('- [ ] Task ^tm-1a2b3c').blockId).toBe('tm-1a2b3c');
  });

  it('falls back to file and line for identity when there is no block ID', () => {
    const task = parse('- [ ] Task');
    expect(task.blockId).toBeUndefined();
    expect(task.id).toBe('::0');
  });

  it('uses the parse context for identity when given one', () => {
    const task = parseTaskLine('- [ ] Task', { file: 'Daily Notes/2026-07-28.md', line: 12 });
    expect(task?.id).toBe('Daily Notes/2026-07-28.md::12');
  });

  it('prefers the block ID on the line over one supplied by the caller', () => {
    const task = parseTaskLine('- [ ] Task ^online', { blockId: 'fromcache' });
    expect(task?.blockId).toBe('online');
  });

  it('accepts a block ID supplied by the metadata cache when the line has none', () => {
    const task = parseTaskLine('- [ ] Task', { blockId: 'fromcache' });
    expect(task?.blockId).toBe('fromcache');
  });

  it('does not mistake a caret mid-description for a block ID', () => {
    const line = '- [ ] Compute x^2 for the report';
    const task = parse(line);
    expect(task.blockId).toBeUndefined();
    expect(serialiseTask(task)).toBe(line);
  });
});

describe('edge cases', () => {
  it('handles an empty description', () => {
    const line = '- [ ] ';
    const task = parse(line);
    expect(task.description).toBe('');
    expect(serialiseTask(task)).toBe(line);
  });

  it('handles a checkbox with nothing after it at all', () => {
    const line = '- [ ]';
    const task = parse(line);
    expect(task.description).toBe('');
    expect(serialiseTask(task)).toBe(line);
  });

  it('handles metadata with no description', () => {
    const line = '- [ ] #crew ⏫ 📅 2026-07-28';
    const task = parse(line);
    expect(task.description).toBe('');
    expect(task.tags).toEqual(['crew']);
    expect(serialiseTask(task)).toBe(line);
  });

  it('treats a leading number as description text, not a list marker', () => {
    // "10." is part of the text. See PLAN.md phase 1.
    const line = '    - [ ] 10. Get canonical Log Analytics KQL query #atlas/support-documentation 🔼';
    const task = parse(line);
    expect(task.description).toBe('10. Get canonical Log Analytics KQL query');
    expect(task.indent).toBe('    ');
    expect(task.priority).toBe(2);
    expect(serialiseTask(task)).toBe(line);
  });

  it('collapses the whitespace left behind by removed metadata in the description', () => {
    const task = parse('- [ ] Do the thing ⏫ then tell Sarah #crew');
    expect(task.description).toBe('Do the thing then tell Sarah');
  });

  it('preserves trailing whitespace on the line', () => {
    const line = '- [ ] Task #crew   ';
    expect(serialiseTask(parse(line))).toBe(line);
  });
});

describe('parsed corpus agrees with the fixture composition', () => {
  // Independent cross-check. The round-trip suite proves the layout tiles each
  // line; these numbers prove the line was actually understood, since tiling a
  // line proves nothing about understanding it.
  //
  // The figures are stated here rather than derived from the parse, so a parser
  // that silently drops a tag or misreads a status breaks this suite. They
  // describe tests/fixtures/vault-corpus.txt, which mirrors the token structure
  // of the live vault as counted by hand on 2026-07-28. The equivalent numbers
  // for the live vault are checked by grep at the phase 2 and 3 gates in
  // PLAN.md, where they belong: they drift the moment Jon ticks a box.
  const tasks = corpusLines().map(parse);
  const open = tasks.filter((t) => t.status === 'open');
  const LANES = ['focus', 'today', 'this-week', 'blocked'];
  const hasLane = (t: Task): boolean => t.tags.some((tag) => LANES.includes(tag));

  it('finds 81 open tasks', () => {
    expect(open).toHaveLength(81);
  });

  it('finds 24 done tasks', () => {
    expect(tasks.filter((t) => t.status === 'done')).toHaveLength(24);
  });

  it('finds 44 open tasks under #atlas or a subtag', () => {
    const atlas = open.filter((t) =>
      t.tags.some((tag) => tag === 'atlas' || tag.startsWith('atlas/')),
    );
    expect(atlas).toHaveLength(44);
  });

  it.each([
    ['this-week', 6],
    ['focus', 3],
    ['today', 2],
    ['blocked', 1],
  ])('finds %i open tasks tagged #%s', (lane, count) => {
    expect(open.filter((t) => t.tags.includes(lane as string))).toHaveLength(count as number);
  });

  it('finds exactly one open task carrying two lane tags', () => {
    const multi = open.filter((t) => t.tags.filter((tag) => LANES.includes(tag)).length > 1);
    expect(multi).toHaveLength(1);
    expect(multi[0]?.tags).toEqual(['crew', 'blocked', 'this-week']);
  });

  it('finds 70 open tasks with no lane tag', () => {
    expect(open.filter((t) => !hasLane(t))).toHaveLength(70);
  });

  it('finds the two block IDs left behind by Task List Kanban', () => {
    const ids = tasks.flatMap((t) => (t.blockId === undefined ? [] : [t.blockId]));
    expect(ids).toEqual(['loe1wz', 'b0q4i3']);
    expect(ids.every((id) => !id.startsWith('tm-'))).toBe(true);
  });

  it('finds no cancelled or custom statuses', () => {
    expect(tasks.filter((t) => t.status === 'cancelled' || t.status === 'custom')).toHaveLength(0);
  });

  it('finds two done tasks with no done date', () => {
    // These land under "Completed, no date" in the Done section. DESIGN.md 6.6.
    const undated = tasks.filter((t) => t.status === 'done' && t.dates.done === undefined);
    expect(undated).toHaveLength(2);
  });

  it('finds six tasks carrying an external context link', () => {
    expect(tasks.filter((t) => t.contextLinks.some((l) => l.kind === 'external'))).toHaveLength(6);
  });

  it('never leaves a tag with its leading hash attached', () => {
    expect(tasks.flatMap((t) => t.tags).filter((tag) => tag.startsWith('#'))).toEqual([]);
  });

  it('never leaves metadata in a description', () => {
    const leaked = tasks.filter((t) => /#[A-Za-z]|🔗|📅|✅|⏫|🔺|🔼|\^tm-/.test(t.description));
    expect(leaked.map((t) => t.description)).toEqual([]);
  });
});
