import { describe, expect, it } from 'vitest';
import { splitInline } from '../src/model/inline';
import { parseTaskLine } from '../src/model/parse';
import { corpusLines } from './corpus';

/**
 * Splitting a description for rendering, so the view can emit working internal
 * links without doing its own parsing. DESIGN.md section 6.3.
 */
describe('splitInline', () => {
  it('returns nothing for an empty description', () => {
    expect(splitInline('')).toEqual([]);
  });

  it('returns plain text as one part', () => {
    expect(splitInline('Draft the crew note')).toEqual([
      { kind: 'text', text: 'Draft the crew note', source: 'Draft the crew note' },
    ]);
  });

  it('leaves a bare # alone, since it is not a tag once the metadata is stripped', () => {
    expect(splitInline('Chase invoice #4021')).toEqual([
      { kind: 'text', text: 'Chase invoice #4021', source: 'Chase invoice #4021' },
    ]);
  });

  it('reads a wikilink', () => {
    expect(splitInline('Speak to [[Sarah Doyle]]')).toEqual([
      { kind: 'text', text: 'Speak to ', source: 'Speak to ' },
      {
        kind: 'wikilink',
        target: 'Sarah Doyle',
        text: 'Sarah Doyle',
        source: '[[Sarah Doyle]]',
      },
    ]);
  });

  it('uses the alias as the link text', () => {
    expect(splitInline('[[Sarah Doyle|Sarah]]')).toEqual([
      {
        kind: 'wikilink',
        target: 'Sarah Doyle',
        text: 'Sarah',
        source: '[[Sarah Doyle|Sarah]]',
      },
    ]);
  });

  it('keeps a heading anchor on the target and shows it as written', () => {
    expect(splitInline('[[Atlas/Migration#Risks]]')).toEqual([
      {
        kind: 'wikilink',
        target: 'Atlas/Migration#Risks',
        text: 'Atlas/Migration#Risks',
        source: '[[Atlas/Migration#Risks]]',
      },
    ]);
  });

  it('reads a markdown link', () => {
    expect(splitInline('Read [the RFC](https://example.com/rfc)')).toEqual([
      { kind: 'text', text: 'Read ', source: 'Read ' },
      {
        kind: 'external',
        target: 'https://example.com/rfc',
        text: 'the RFC',
        source: '[the RFC](https://example.com/rfc)',
      },
    ]);
  });

  it('handles several links and the text between them', () => {
    expect(
      splitInline('Ask [[Sarah Doyle]] about [[Atlas]] before Friday').map((part) => part.kind),
    ).toEqual(['text', 'wikilink', 'text', 'wikilink', 'text']);
  });

  it('handles a link at the very start', () => {
    expect(splitInline('[[Atlas]] needs a decision').map((part) => part.kind)).toEqual([
      'wikilink',
      'text',
    ]);
  });

  it('leaves an unclosed wikilink as text', () => {
    expect(splitInline('Speak to [[Sarah Doyle').map((part) => part.kind)).toEqual(['text']);
  });

  it('leaves an empty wikilink as text', () => {
    expect(splitInline('Nothing here [[]]').map((part) => part.kind)).toEqual(['text']);
  });

  it('leaves a markdown link with no target as text', () => {
    expect(splitInline('Read [the RFC]()').map((part) => part.kind)).toEqual(['text']);
  });
});

describe('splitInline tiles its input', () => {
  const tiles = (description: string): boolean =>
    splitInline(description)
      .map((part) => part.source)
      .join('') === description;

  it('loses nothing on a description mixing both link shapes', () => {
    expect(tiles('Ask [[Sarah Doyle|Sarah]] to read [the RFC](https://example.com) #4021')).toBe(
      true,
    );
  });

  it('loses nothing on any description in the corpus', () => {
    // The fixture is the only source of descriptions that were not written to suit
    // this test, which is what makes it worth walking.
    const descriptions = corpusLines()
      .map((line) => parseTaskLine(line, { file: 'corpus.md' })?.description)
      .filter((description): description is string => description !== undefined);

    expect(descriptions.length).toBeGreaterThan(100);
    for (const description of descriptions) {
      expect(tiles(description), description).toBe(true);
    }
  });

  it('loses nothing on malformed link syntax', () => {
    for (const description of [
      '[[',
      ']]',
      '[[a]',
      '[a]](b)',
      '[[a|b|c]]',
      '[](https://x)',
      '[[a]][[b]]',
      'a [[b]] c [d](e) f',
    ]) {
      expect(tiles(description), description).toBe(true);
    }
  });
});
