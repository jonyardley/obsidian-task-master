import { isSpace, readToken } from './tokens';
import {
  NORMAL_PRIORITY,
  type ContextLink,
  type DateKind,
  type Priority,
  type Segment,
  type Task,
  type TaskStatus,
} from './types';

/**
 * Structural facts about a task line that come from Obsidian's metadata cache
 * rather than from the line itself. See DESIGN.md section 5.3.
 */
export interface ParseContext {
  file: string;
  line: number;
  parentLine: number;
  section?: string;
  /** From `ListItemCache.id`, when the line carries a block ID. */
  blockId?: string;
}

const MARKER = /^([-*+])([ \t]+)\[(.)\]/;
/** A block ID at end of line, preceded by whitespace. */
const TRAILING_BLOCK_ID = /(\s+)\^([A-Za-z0-9_-]+)([ \t]*)$/;

function statusFor(char: string): TaskStatus {
  if (char === ' ') return 'open';
  if (char === 'x' || char === 'X') return 'done';
  if (char === '-') return 'cancelled';
  return 'custom';
}

/**
 * Parses one markdown task line.
 *
 * Returns null when the line is not a task at all. Callers in `data/` take their
 * lines from `ListItemCache` entries where `task !== undefined`, so null is
 * exceptional there; the inline editor in phase 8 uses it as validation.
 *
 * The line is decomposed into segments that cover it completely, with no gaps and
 * no overlaps, so concatenating every segment's text reproduces the input exactly.
 * That is what makes the round-trip guarantee in DESIGN.md section 4.3 hold.
 */
export function parseTaskLine(raw: string, ctx?: Partial<ParseContext>): Task | null {
  const layout: Segment[] = [];

  let pos = 0;
  while (pos < raw.length && isSpace(raw.charAt(pos))) pos += 1;
  const indent = raw.slice(0, pos);
  if (indent.length > 0) layout.push({ kind: 'indent', text: indent });

  const marker = MARKER.exec(raw.slice(pos));
  if (!marker) return null;
  const statusChar = marker[3] as string;
  layout.push({ kind: 'marker', text: marker[0] });
  pos += marker[0].length;

  const { bodyEnd, blockId, tail } = splitTrailingBlockId(raw, pos);
  const bodyStart = pos;

  const tags: string[] = [];
  const dates: Partial<Record<DateKind, string>> = {};
  const contextLinks: ContextLink[] = [];
  const preserved: string[] = [];
  let priority: Priority = NORMAL_PRIORITY;
  let prioritySeen = false;

  /** Tokens are only recognised at a whitespace boundary, as Obsidian Tasks does. */
  const atBoundary = (i: number): boolean => i === bodyStart || isSpace(raw.charAt(i - 1));

  let i = pos;
  while (i < bodyEnd) {
    if (isSpace(raw.charAt(i))) {
      const start = i;
      while (i < bodyEnd && isSpace(raw.charAt(i))) i += 1;
      layout.push({ kind: 'space', text: raw.slice(start, i) });
      continue;
    }

    const token = atBoundary(i) ? readToken(raw, i, bodyEnd) : null;
    if (token) {
      layout.push(token.segment);
      switch (token.segment.kind) {
        case 'priority':
          if (!prioritySeen) {
            priority = token.segment.priority;
            prioritySeen = true;
          }
          break;
        case 'date':
          // First occurrence wins, so the model matches reading order. A duplicate
          // glyph keeps its own segment and therefore still round-trips.
          if (dates[token.segment.dateKind] === undefined) {
            dates[token.segment.dateKind] = token.segment.value;
          }
          break;
        case 'tag':
          tags.push(token.segment.tag);
          break;
        case 'links':
          contextLinks.push(...token.segment.links);
          break;
        case 'preserved':
          preserved.push(token.segment.text);
          break;
        default:
          break;
      }
      i = token.end;
      continue;
    }

    // Not a token: take a whole whitespace-delimited word as description text.
    const start = i;
    while (i < bodyEnd && !isSpace(raw.charAt(i))) i += 1;
    layout.push({ kind: 'text', text: raw.slice(start, i) });
  }

  layout.push(...tail);

  const resolvedBlockId = blockId ?? ctx?.blockId;
  const file = ctx?.file ?? '';
  const line = ctx?.line ?? 0;

  const task: Task = {
    id: resolvedBlockId ?? `${file}::${line}`,
    ...(resolvedBlockId === undefined ? {} : { blockId: resolvedBlockId }),
    file,
    line,
    indent,
    parentLine: ctx?.parentLine ?? -1,
    ...(ctx?.section === undefined ? {} : { section: ctx.section }),
    raw,
    roundTrips: false,
    status: statusFor(statusChar),
    statusChar,
    description: describe(layout),
    tags,
    priority,
    dates,
    contextLinks,
    preserved,
    layout,
  };

  task.roundTrips = layout.map((segment) => segment.text).join('') === raw;
  return task;
}

/**
 * Pulls a trailing block ID off the line before the body is scanned, so it can
 * never be mistaken for description text and always serialises last.
 */
function splitTrailingBlockId(
  raw: string,
  bodyStart: number,
): { bodyEnd: number; blockId?: string; tail: Segment[] } {
  const trailing = TRAILING_BLOCK_ID.exec(raw);
  if (!trailing || trailing.index < bodyStart) return { bodyEnd: raw.length, tail: [] };

  const blockId = trailing[2] as string;
  const tail: Segment[] = [
    { kind: 'space', text: trailing[1] as string },
    { kind: 'blockId', text: `^${blockId}`, blockId },
  ];
  const padding = trailing[3] as string;
  if (padding.length > 0) tail.push({ kind: 'space', text: padding });

  return { bodyEnd: trailing.index, blockId, tail };
}

/**
 * The description: text with all metadata removed and inline wikilinks intact.
 *
 * Whitespace is collapsed, so the gaps left by removed tokens do not show up as
 * runs of spaces. This is display and search text; `raw` remains the source of
 * truth for anything written back.
 */
function describe(layout: readonly Segment[]): string {
  return layout
    .filter((segment) => segment.kind === 'text' || segment.kind === 'space')
    .map((segment) => segment.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
