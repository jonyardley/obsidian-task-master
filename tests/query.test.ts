import { describe, expect, it } from 'vitest';
import { parseTaskLine } from '../src/model/parse';
import {
  EMPTY_FILTER,
  isFiltering,
  isVisible,
  matchesFilter,
  matchesTagSelection,
  tagFacets,
  type FilterState,
} from '../src/model/query';
import type { Task } from '../src/model/types';
import { DEFAULT_SETTINGS } from '../src/settings';

/** The toolbar's filter, per DESIGN.md section 6.4. */

function parse(line: string, file = 'Inbox.md', line0 = 0): Task {
  const task = parseTaskLine(line, { file, line: line0 });
  if (!task) throw new Error(`expected a task, got null for: ${line}`);
  return task;
}

function filter(overrides: Partial<FilterState> = {}): FilterState {
  return { ...EMPTY_FILTER, ...overrides };
}

describe('matchesTagSelection, hierarchical prefix matching', () => {
  const cases: [name: string, taskTags: string[], selected: string[], expected: boolean][] = [
    ['no selection matches everything', ['crew'], [], true],
    ['no selection matches an untagged task', [], [], true],
    ['an exact tag matches', ['crew'], ['crew'], true],
    ['a parent selection matches the parent itself', ['atlas'], ['atlas'], true],
    ['a parent selection matches a subtag', ['atlas/docs'], ['atlas'], true],
    ['a parent selection matches a deeper subtag', ['atlas/docs/kql'], ['atlas'], true],
    ['a subtag selection does not match the parent', ['atlas'], ['atlas/docs'], false],
    ['a subtag selection does not match a sibling', ['atlas/migration'], ['atlas/docs'], false],
    ['matching is at a segment boundary, not a bare prefix', ['atlasgeddon'], ['atlas'], false],
    ['a trailing slash on the task tag still matches its parent', ['atlas/'], ['atlas'], true],
    ['an untagged task matches nothing once a tag is selected', [], ['atlas'], false],
  ];

  it.each(cases)('%s', (_name, taskTags, selected, expected) => {
    expect(matchesTagSelection(taskTags, selected, 'any')).toBe(expected);
    expect(matchesTagSelection(taskTags, selected, 'all')).toBe(expected);
  });

  it('folds case, because Obsidian treats #Atlas and #atlas as one tag', () => {
    expect(matchesTagSelection(['Atlas/Docs'], ['atlas'], 'any')).toBe(true);
    expect(matchesTagSelection(['atlas/docs'], ['ATLAS'], 'any')).toBe(true);
  });

  it('ignores a blank selection entry rather than matching nothing', () => {
    expect(matchesTagSelection(['crew'], ['  '], 'any')).toBe(true);
    expect(matchesTagSelection(['crew'], ['  ', 'atlas'], 'any')).toBe(false);
  });
});

describe('matchesTagSelection, any and all', () => {
  it('any needs one selected tag to match', () => {
    expect(matchesTagSelection(['crew'], ['crew', 'atlas'], 'any')).toBe(true);
  });

  it('all needs every selected tag to match', () => {
    expect(matchesTagSelection(['crew'], ['crew', 'atlas'], 'all')).toBe(false);
    expect(matchesTagSelection(['crew', 'atlas/docs'], ['crew', 'atlas'], 'all')).toBe(true);
  });

  it('counts one task tag towards one selection each, hierarchy included', () => {
    // #atlas/docs satisfies both `atlas` and `atlas/docs`, so `all` is met by it alone.
    expect(matchesTagSelection(['atlas/docs'], ['atlas', 'atlas/docs'], 'all')).toBe(true);
  });
});

describe('matchesFilter, search', () => {
  const task = parse('- [ ] Draft the handover swim lanes #atlas/migration', 'Projects/Atlas.md');

  const cases: [name: string, search: string, expected: boolean][] = [
    ['an empty search matches everything', '', true],
    ['a whitespace-only search matches everything', '   ', true],
    ['a description substring matches', 'swim', true],
    ['matching is case-insensitive', 'HANDOVER', true],
    ['the search term is trimmed', '  handover  ', true],
    ['a file path substring matches', 'projects/', true],
    ['a file name substring matches', 'atlas.md', true],
    ['a term in neither does not match', 'beacon', false],
  ];

  it.each(cases)('%s', (_name, search, expected) => {
    expect(matchesFilter(task, filter({ search }))).toBe(expected);
  });

  it('does not search tags, which are the tag filter\'s job', () => {
    // 'migration' appears only in the tag, and DESIGN.md section 6.4 scopes search
    // to the description and the file path.
    expect(matchesFilter(task, filter({ search: 'migration' }))).toBe(false);
  });

  it('does not search metadata glyphs or dates', () => {
    const dated = parse('- [ ] Ring the bank 📅 2026-07-20', 'Inbox.md');
    expect(matchesFilter(dated, filter({ search: '2026-07-20' }))).toBe(false);
  });

  it('searches the collapsed description, so a run of spaces still matches', () => {
    const spaced = parse('- [ ] Two    spaces');
    expect(spaced.description).toBe('Two spaces');
    expect(matchesFilter(spaced, filter({ search: 'two spaces' }))).toBe(true);
  });

  it('matches a description wikilink by its source text', () => {
    const linked = parse('- [ ] Reply to [[Ada Fenwick]] about the review');
    expect(matchesFilter(linked, filter({ search: 'ada fenwick' }))).toBe(true);
  });
});

describe('matchesFilter, search and tags together', () => {
  const task = parse('- [ ] Draft the handover swim lanes #atlas/migration', 'Projects/Atlas.md');

  it('requires both when both are set', () => {
    expect(matchesFilter(task, filter({ search: 'handover', tags: ['atlas'] }))).toBe(true);
    expect(matchesFilter(task, filter({ search: 'handover', tags: ['crew'] }))).toBe(false);
    expect(matchesFilter(task, filter({ search: 'beacon', tags: ['atlas'] }))).toBe(false);
  });
});

describe('isFiltering', () => {
  it('is false for an empty filter', () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false);
  });

  it('is false for a whitespace-only search', () => {
    expect(isFiltering(filter({ search: '  ' }))).toBe(false);
  });

  it('is true once a search term or a tag is set', () => {
    expect(isFiltering(filter({ search: 'atlas' }))).toBe(true);
    expect(isFiltering(filter({ tags: ['atlas'] }))).toBe(true);
  });

  it('is false for a sort choice, which narrows nothing', () => {
    expect(isFiltering(filter({ sort: 'due' }))).toBe(false);
  });
});

describe('isVisible', () => {
  it('hides a cancelled task unless showCancelled is set', () => {
    const cancelled = parse('- [-] abandoned ❌ 2026-07-22');
    expect(isVisible(cancelled, DEFAULT_SETTINGS)).toBe(false);
    expect(isVisible(cancelled, { ...DEFAULT_SETTINGS, showCancelled: true })).toBe(true);
  });

  it('keeps every other status', () => {
    for (const line of ['- [ ] open', '- [x] done', '- [/] in progress']) {
      expect(isVisible(parse(line), DEFAULT_SETTINGS)).toBe(true);
    }
  });
});

describe('tagFacets', () => {
  it('orders by frequency, then by tag, and rolls subtags into their parent', () => {
    const tasks = [
      parse('- [ ] one #atlas/docs'),
      parse('- [ ] two #atlas/migration'),
      parse('- [ ] three #crew'),
      parse('- [ ] four #crew'),
      parse('- [ ] five #crew'),
    ];
    expect(tagFacets(tasks)).toEqual([
      { tag: 'crew', count: 3 },
      { tag: 'atlas', count: 2 },
      { tag: 'atlas/docs', count: 1 },
      { tag: 'atlas/migration', count: 1 },
    ]);
  });

  it('offers an ancestor no task carries on its own, so a whole project is selectable', () => {
    const facets = tagFacets([parse('- [ ] one #atlas/docs')]);
    expect(facets.map((facet) => facet.tag)).toContain('atlas');
  });

  it('counts a task once per facet even when it repeats a tag', () => {
    expect(tagFacets([parse('- [ ] one #crew #crew')])).toEqual([{ tag: 'crew', count: 1 }]);
  });

  it('counts a task once for a parent it carries alongside a subtag', () => {
    expect(tagFacets([parse('- [ ] one #atlas #atlas/docs')])).toEqual([
      { tag: 'atlas', count: 1 },
      { tag: 'atlas/docs', count: 1 },
    ]);
  });

  it('folds case variants into one facet, keeping the first spelling seen', () => {
    const facets = tagFacets([parse('- [ ] one #Crew'), parse('- [ ] two #crew')]);
    expect(facets).toEqual([{ tag: 'Crew', count: 2 }]);
  });

  it('includes done tasks, since the Done section is filtered too', () => {
    expect(tagFacets([parse('- [x] one #crew ✅ 2026-07-24')])).toEqual([
      { tag: 'crew', count: 1 },
    ]);
  });

  it('is empty when nothing is tagged', () => {
    expect(tagFacets([parse('- [ ] untagged')])).toEqual([]);
  });

  it('keeps a selected tag no task carries any more, at a count of zero', () => {
    // Otherwise retagging the last #beacon task leaves the view empty and the
    // selection that emptied it missing from the list it was chosen in.
    expect(tagFacets([parse('- [ ] one #crew')], ['beacon'])).toEqual([
      { tag: 'crew', count: 1 },
      { tag: 'beacon', count: 0 },
    ]);
  });

  it('does not duplicate a selected tag that is still in the index', () => {
    expect(tagFacets([parse('- [ ] one #atlas/docs')], ['atlas', 'atlas/docs'])).toEqual([
      { tag: 'atlas', count: 1 },
      { tag: 'atlas/docs', count: 1 },
    ]);
  });

  it('ignores a blank selection entry', () => {
    expect(tagFacets([parse('- [ ] one #crew')], ['  '])).toEqual([{ tag: 'crew', count: 1 }]);
  });
});
