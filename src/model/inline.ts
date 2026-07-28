/**
 * Splits a description into text and link parts so the view can render working
 * links without parsing markdown itself. DESIGN.md section 6.3.
 *
 * Only the two link shapes the vault uses inside descriptions are recognised.
 * Everything else, emphasis and inline code included, stays text: the row shows
 * the description, it does not render markdown.
 *
 * Nothing in src/model/ may import from Obsidian. See DESIGN.md section 5.2.
 */

export interface InlineText {
  kind: 'text';
  text: string;
  /** The source this part came from. Identical to `text` for a text part. */
  source: string;
}

export interface InlineLink {
  kind: 'wikilink' | 'external';
  /** Wikilink target, heading anchor included, or the URL. */
  target: string;
  /** What the row displays. */
  text: string;
  /** The link exactly as written, so the parts can be shown to tile the input. */
  source: string;
}

export type InlinePart = InlineText | InlineLink;

const LINK = /\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]|\[([^[\]]*)\]\(([^()\s]+)\)/g;

export function splitInline(description: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let cursor = 0;

  for (const match of description.matchAll(LINK)) {
    const [source, wikiTarget, alias, linkText, url] = match;
    if (match.index > cursor) {
      const text = description.slice(cursor, match.index);
      parts.push({ kind: 'text', text, source: text });
    }
    if (wikiTarget !== undefined) {
      parts.push({
        kind: 'wikilink',
        target: wikiTarget,
        text: alias !== undefined && alias !== '' ? alias : wikiTarget,
        source,
      });
    } else if (url !== undefined) {
      parts.push({ kind: 'external', target: url, text: linkText ?? url, source });
    }
    cursor = match.index + source.length;
  }

  if (cursor < description.length) {
    const text = description.slice(cursor);
    parts.push({ kind: 'text', text, source: text });
  }
  return parts;
}
