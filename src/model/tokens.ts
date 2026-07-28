import type { ContextLink, DateKind, Priority, Segment } from './types';

/**
 * The lexer: recognising one metadata token at a given offset.
 *
 * Every reader returns the verbatim source text alongside the parsed value, and
 * the offset just past what it consumed. Nothing here normalises anything, which
 * is what lets `serialise.ts` rebuild a line byte for byte.
 *
 * A reader that cannot make sense of what it sees returns null, and the caller
 * falls through to treating the text as description. A glyph is never partially
 * consumed: `📅 soon` is prose, not a broken date.
 */

export const PRIORITY_GLYPHS: ReadonlyArray<readonly [string, Priority]> = [
  ['🔺', 0],
  ['⏫', 1],
  ['🔼', 2],
  ['🔽', 4],
  ['⏬', 5],
];

export const DATE_GLYPHS: ReadonlyArray<readonly [string, DateKind]> = [
  ['➕', 'created'],
  ['🛫', 'start'],
  ['⏳', 'scheduled'],
  ['📅', 'due'],
  ['✅', 'done'],
  ['❌', 'cancelled'],
];

/** Recognised but never interpreted. See DESIGN.md section 2.2. */
export const PRESERVED_GLYPHS: readonly string[] = ['🔁', '🆔', '⛔'];

export const LINK_GLYPH = '🔗';
/** U+00B7 MIDDLE DOT, surrounded by single spaces. */
export const LINK_SEPARATOR = ' · ';

const DATE_VALUE = /^\d{4}-\d{2}-\d{2}/;
const TAG_BODY = /^[A-Za-z0-9_/-]+/;

export function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t';
}

export interface Consumed {
  segment: Segment;
  end: number;
}

/** Tries every token reader at `i`, in the order that resolves ambiguity correctly. */
export function readToken(raw: string, i: number, bodyEnd: number): Consumed | null {
  return (
    readPriority(raw, i) ??
    readDate(raw, i, bodyEnd) ??
    readLinks(raw, i, bodyEnd) ??
    readPreserved(raw, i, bodyEnd) ??
    readTag(raw, i, bodyEnd)
  );
}

function readPriority(raw: string, i: number): Consumed | null {
  for (const [glyph, priority] of PRIORITY_GLYPHS) {
    if (raw.startsWith(glyph, i)) {
      return { segment: { kind: 'priority', text: glyph, priority }, end: i + glyph.length };
    }
  }
  return null;
}

function readDate(raw: string, i: number, bodyEnd: number): Consumed | null {
  for (const [glyph, dateKind] of DATE_GLYPHS) {
    if (!raw.startsWith(glyph, i)) continue;

    let j = i + glyph.length;
    while (j < bodyEnd && isSpace(raw.charAt(j))) j += 1;
    const value = DATE_VALUE.exec(raw.slice(j, bodyEnd));
    // A glyph without a well-formed date is description text, not a date. That
    // keeps a malformed line readable and still round-tripping.
    if (!value) return null;

    const end = j + value[0].length;
    return {
      segment: { kind: 'date', text: raw.slice(i, end), dateKind, value: value[0] },
      end,
    };
  }
  return null;
}

function readPreserved(raw: string, i: number, bodyEnd: number): Consumed | null {
  for (const glyph of PRESERVED_GLYPHS) {
    if (!raw.startsWith(glyph, i)) continue;

    let j = i + glyph.length;
    while (j < bodyEnd && isSpace(raw.charAt(j))) j += 1;

    // Consume the payload word by word, stopping before anything that starts
    // another token. Recurrence rules ("every week") are multi-word; ids are not.
    // Each recursive readToken starts strictly later in the line, so this
    // terminates.
    while (j < bodyEnd) {
      const wordStart = j;
      while (j < bodyEnd && !isSpace(raw.charAt(j))) j += 1;
      if (j === wordStart) break;
      let k = j;
      while (k < bodyEnd && isSpace(raw.charAt(k))) k += 1;
      if (k >= bodyEnd || readToken(raw, k, bodyEnd) !== null) break;
      j = k;
    }

    return { segment: { kind: 'preserved', text: raw.slice(i, j) }, end: j };
  }
  return null;
}

function readTag(raw: string, i: number, bodyEnd: number): Consumed | null {
  if (raw.charAt(i) !== '#') return null;

  const body = TAG_BODY.exec(raw.slice(i + 1, bodyEnd));
  if (!body) return null;
  // Obsidian does not treat an all-numeric fragment as a tag, and a bare '#' in
  // prose is not a tag either.
  if (!/[^0-9/]/.test(body[0])) return null;

  const end = i + 1 + body[0].length;
  return { segment: { kind: 'tag', text: raw.slice(i, end), tag: body[0] }, end };
}

/**
 * A `🔗` run: the glyph, then one or more links separated by ` · `.
 *
 * A run may mix wikilinks and markdown external links. See DESIGN.md section 4.1.
 */
function readLinks(raw: string, i: number, bodyEnd: number): Consumed | null {
  if (!raw.startsWith(LINK_GLYPH, i)) return null;

  let j = i + LINK_GLYPH.length;
  while (j < bodyEnd && isSpace(raw.charAt(j))) j += 1;

  const links: ContextLink[] = [];
  for (;;) {
    const link = readOneLink(raw, j, bodyEnd);
    if (!link) break;
    links.push(link.link);
    j = link.end;

    // Only step over the separator if a link genuinely follows it, so a trailing
    // " · " stays description text rather than being swallowed.
    if (raw.startsWith(LINK_SEPARATOR, j) && readOneLink(raw, j + LINK_SEPARATOR.length, bodyEnd)) {
      j += LINK_SEPARATOR.length;
      continue;
    }
    break;
  }

  // A lone glyph with nothing link-shaped after it is description text.
  if (links.length === 0) return null;

  return { segment: { kind: 'links', text: raw.slice(i, j), links }, end: j };
}

function readOneLink(
  raw: string,
  i: number,
  bodyEnd: number,
): { link: ContextLink; end: number } | null {
  if (raw.startsWith('[[', i)) {
    const close = raw.indexOf(']]', i + 2);
    if (close === -1 || close + 2 > bodyEnd) return null;
    const inner = raw.slice(i + 2, close);
    const pipe = inner.indexOf('|');
    const target = pipe === -1 ? inner : inner.slice(0, pipe);
    const alias = pipe === -1 ? undefined : inner.slice(pipe + 1);
    return {
      link: {
        kind: 'wikilink',
        target,
        ...(alias === undefined ? {} : { alias }),
        isSource: alias === 'source',
      },
      end: close + 2,
    };
  }

  if (raw.charAt(i) === '[') {
    const textClose = raw.indexOf('](', i + 1);
    if (textClose === -1 || textClose >= bodyEnd) return null;
    // Takes the first ')' after '](': URLs with unescaped parentheses would need
    // balancing, and none appear in this vault.
    const close = raw.indexOf(')', textClose + 2);
    if (close === -1 || close + 1 > bodyEnd) return null;
    const alias = raw.slice(i + 1, textClose);
    return {
      link: {
        kind: 'external',
        target: raw.slice(textClose + 2, close),
        ...(alias === '' ? {} : { alias }),
        isSource: alias === 'source',
      },
      end: close + 1,
    };
  }

  return null;
}
