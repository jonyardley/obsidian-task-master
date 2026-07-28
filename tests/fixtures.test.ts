import { describe, expect, it } from 'vitest';
import { parseTaskLine } from '../src/model/parse';
import type { LinksSegment, Task } from '../src/model/types';
import { corpusLines, EXPECTED_CORPUS_SIZE } from './corpus';

/**
 * Grammar coverage of the corpus fixture, asserted independently of its content.
 *
 * The round-trip suite proves each line survives a parse. This suite proves the
 * fixture is still worth round-tripping: that it exercises every construct the
 * grammar in DESIGN.md section 4.1 admits. It exists so the fixture can be
 * replaced without silently losing coverage, and it deliberately names no tag,
 * person or path.
 */

const tasks: Task[] = corpusLines().map((line) => {
  const task = parseTaskLine(line);
  if (task === null) throw new Error(`fixture line does not parse: ${line}`);
  return task;
});

const some = (predicate: (t: Task) => boolean): boolean => tasks.some(predicate);
const kinds = (t: Task): string[] => t.layout.map((s) => s.kind);
const linkRuns = (t: Task): LinksSegment[] =>
  t.layout.filter((s): s is LinksSegment => s.kind === 'links');

describe('the fixture is the expected size', () => {
  it('holds exactly the declared number of lines', () => {
    expect(tasks).toHaveLength(EXPECTED_CORPUS_SIZE);
  });
});

describe('the fixture covers the line shapes', () => {
  it.each([
    ['unindented', (t: Task) => t.indent === ''],
    ['indented two spaces', (t: Task) => t.indent === '  '],
    ['indented four spaces', (t: Task) => t.indent === '    '],
  ])('includes at least one %s line', (_label, predicate) => {
    expect(some(predicate)).toBe(true);
  });

  it.each([['open'], ['done']])('includes at least one %s task', (status) => {
    expect(some((t) => t.status === status)).toBe(true);
  });
});

describe('the fixture covers every metadata token in use', () => {
  it.each([['🔺'], ['⏫'], ['🔼']])('includes the %s priority glyph', (glyph) => {
    expect(some((t) => t.raw.includes(glyph))).toBe(true);
  });

  it('parses a priority glyph to something other than normal on those lines', () => {
    const glyphed = tasks.filter((t) => /🔺|⏫|🔼/.test(t.raw));
    expect(glyphed.length).toBeGreaterThan(0);
    expect(glyphed.map((t) => t.priority).filter((p) => p === 3)).toEqual([]);
  });

  it('resolves at least three distinct priorities', () => {
    expect(new Set(tasks.map((t) => t.priority)).size).toBeGreaterThanOrEqual(3);
  });

  it.each([['due'], ['done']])('includes a %s date', (kind) => {
    expect(some((t) => t.dates[kind as 'due' | 'done'] !== undefined)).toBe(true);
  });

  it('includes a trailing block ID on at least two lines', () => {
    const ids = tasks.flatMap((t) => (t.blockId === undefined ? [] : [t.blockId]));
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries no plugin-assigned block IDs, which are only minted at runtime', () => {
    expect(tasks.filter((t) => t.blockId?.startsWith('tm-'))).toEqual([]);
  });
});

describe('the fixture covers the tag shapes', () => {
  it('includes a nested tag', () => {
    expect(some((t) => t.tags.some((tag) => tag.includes('/')))).toBe(true);
  });

  it('includes a line carrying three or more tags', () => {
    expect(some((t) => t.tags.length >= 3)).toBe(true);
  });

  it('includes a line carrying no tags at all', () => {
    expect(some((t) => t.tags.length === 0)).toBe(true);
  });
});

describe('the fixture covers the 🔗 context-link shapes', () => {
  it('includes a bare wikilink, with no alias', () => {
    expect(
      some((t) => t.contextLinks.some((l) => l.kind === 'wikilink' && l.alias === undefined)),
    ).toBe(true);
  });

  it('includes an aliased wikilink', () => {
    expect(
      some((t) =>
        t.contextLinks.some((l) => l.kind === 'wikilink' && l.alias !== undefined && !l.isSource),
      ),
    ).toBe(true);
  });

  it('includes a provenance link, aliased exactly "source"', () => {
    expect(some((t) => t.contextLinks.some((l) => l.isSource))).toBe(true);
  });

  it('includes an external markdown link', () => {
    expect(some((t) => t.contextLinks.some((l) => l.kind === 'external'))).toBe(true);
  });

  it('includes a run of two or more links', () => {
    expect(some((t) => linkRuns(t).some((run) => run.links.length >= 2))).toBe(true);
  });

  it('includes one run mixing an external link and a wikilink', () => {
    const mixed = some((t) =>
      linkRuns(t).some(
        (run) =>
          run.links.some((l) => l.kind === 'external') &&
          run.links.some((l) => l.kind === 'wikilink'),
      ),
    );
    expect(mixed).toBe(true);
  });

  it('includes a wikilink target containing an apostrophe', () => {
    // Apostrophes in a page name are the character most likely to break a
    // naive target regex, so the fixture must keep one.
    const inLinks = some((t) => t.contextLinks.some((l) => l.target.includes("'")));
    const inDescription = some((t) => /\[\[[^\]]*'[^\]]*\]\]/.test(t.description));
    expect(inLinks || inDescription).toBe(true);
  });
});

describe('the fixture covers description content that could be mistaken for metadata', () => {
  it('keeps an inline wikilink in the description', () => {
    expect(some((t) => t.description.includes('[['))).toBe(true);
  });

  it('includes a description opening with a numeric list prefix', () => {
    expect(some((t) => /^\d+\./.test(t.description))).toBe(true);
  });

  it('includes a description containing a slash', () => {
    expect(some((t) => t.description.includes('/'))).toBe(true);
  });
});

describe('the fixture covers varied metadata order', () => {
  const orderOf = (t: Task, kind: string): number => kinds(t).indexOf(kind);
  const hasBoth = (t: Task, a: string, b: string): boolean =>
    orderOf(t, a) !== -1 && orderOf(t, b) !== -1;

  it('includes a line with tags before the link run, and one with tags after', () => {
    const withLinks = tasks.filter((t) => hasBoth(t, 'tag', 'links'));
    expect(withLinks.some((t) => orderOf(t, 'tag') < orderOf(t, 'links'))).toBe(true);
    expect(withLinks.some((t) => orderOf(t, 'tag') > orderOf(t, 'links'))).toBe(true);
  });

  it('includes a line with a date before the tags, and one with a date after', () => {
    const withBoth = tasks.filter((t) => hasBoth(t, 'date', 'tag'));
    expect(withBoth.some((t) => orderOf(t, 'date') < orderOf(t, 'tag'))).toBe(true);
    expect(withBoth.some((t) => orderOf(t, 'date') > orderOf(t, 'tag'))).toBe(true);
  });

  it('includes a line whose priority follows its tags', () => {
    const withBoth = tasks.filter((t) => hasBoth(t, 'priority', 'tag'));
    expect(withBoth.some((t) => orderOf(t, 'priority') > orderOf(t, 'tag'))).toBe(true);
  });

  it('includes a done task with a done date, and one without', () => {
    const done = tasks.filter((t) => t.status === 'done');
    expect(done.some((t) => t.dates.done !== undefined)).toBe(true);
    expect(done.some((t) => t.dates.done === undefined)).toBe(true);
  });
});
