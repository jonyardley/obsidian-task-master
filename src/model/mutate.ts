import { parseTaskLine } from './parse';
import { DATE_GLYPHS, PRIORITY_GLYPHS } from './tokens';
import type { DateKind, Priority, Segment, Task } from './types';

/**
 * The mutations, per DESIGN.md section 5.4. All pure.
 *
 * Every one works by editing `task.layout` and reparsing the result, never by
 * rebuilding a line from the scalar fields. That is what makes them inherit the
 * round-trip guarantee: whatever a mutation does not touch comes back byte for
 * byte. See DESIGN.md section 4.3.
 *
 * A mutation returns null when it refuses: the line does not round-trip, or the
 * line it would produce cannot be read back. Refusing is always better than
 * writing something Jon did not type.
 */

/** ── the public mutations ── */

/**
 * Completes or uncompletes. `doneDate` is stamped only when completing, and only
 * when `settings.addDoneDate` is on; uncompleting always removes `✅` and its date.
 */
export function setStatus(task: Task, status: 'open' | 'done', doneDate?: string): Task | null {
  if (!task.roundTrips) return null;

  let layout = withStatusChar(task.layout, status === 'done' ? 'x' : ' ');
  if (status === 'open') layout = withDate(layout, 'done', null);
  else if (doneDate !== undefined) layout = withDate(layout, 'done', doneDate);

  return rebuild(task, layout);
}

/** Normal priority means no glyph, so setting it removes one. */
export function setPriority(task: Task, priority: Priority): Task | null {
  if (!task.roundTrips) return null;
  return rebuild(task, withPriority(task.layout, priority));
}

/**
 * `null` clears the date. Anything that is not an ISO `YYYY-MM-DD` is refused: a
 * dangling glyph round-trips perfectly well, so `rebuild` would let it through.
 * The check is the shape only, since what a date means is the Tasks plugin's business.
 */
export function setDate(task: Task, kind: DateKind, value: string | null): Task | null {
  if (!task.roundTrips) return null;
  if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return rebuild(task, withDate(task.layout, kind, value));
}

/**
 * The order the row's priority control cycles through: normal, then most urgent to
 * least, and back to normal. The hotkeys in DESIGN.md section 6.8 set a priority
 * directly; this is for the one-click case.
 */
const PRIORITY_CYCLE: readonly Priority[] = [3, 0, 1, 2, 4, 5];

export function nextPriority(priority: Priority): Priority {
  const at = PRIORITY_CYCLE.indexOf(priority);
  return PRIORITY_CYCLE[(at + 1) % PRIORITY_CYCLE.length] ?? 3;
}

/** Local date as ISO `YYYY-MM-DD`. UTC would read as tomorrow for a late-evening tick. */
export function toISODate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** ── layout edits ── */

function withStatusChar(layout: readonly Segment[], char: string): Segment[] {
  return layout.map((segment) =>
    segment.kind === 'marker'
      ? { ...segment, text: `${segment.text.slice(0, -2)}${char}]` }
      : segment,
  );
}

function withPriority(layout: readonly Segment[], priority: Priority): Segment[] {
  const glyph = PRIORITY_GLYPHS.find(([, candidate]) => candidate === priority)?.[0];
  if (glyph === undefined) return without(layout, (segment) => segment.kind === 'priority');

  const first = layout.findIndex((segment) => segment.kind === 'priority');
  const replacement: Segment = { kind: 'priority', text: glyph, priority };
  // A line carrying two glyphs keeps the second: the first is what parses, so
  // replacing it is enough, and removing the other would change more than asked.
  if (first !== -1) return layout.map((segment, i) => (i === first ? replacement : segment));
  return inserted(layout, replacement);
}

function withDate(layout: readonly Segment[], kind: DateKind, value: string | null): Segment[] {
  const matches = (segment: Segment): boolean => segment.kind === 'date' && segment.dateKind === kind;
  if (value === null) return without(layout, matches);

  const first = layout.findIndex(matches);
  if (first !== -1) {
    return layout.map((segment, i) =>
      i === first && segment.kind === 'date'
        ? { ...segment, value, text: segment.text.replace(/\d{4}-\d{2}-\d{2}$/, value) }
        : segment,
    );
  }

  const glyph = DATE_GLYPHS.find(([, candidate]) => candidate === kind)?.[0];
  if (glyph === undefined) return [...layout];
  return inserted(layout, { kind: 'date', text: `${glyph} ${value}`, dateKind: kind, value });
}

/** ── canonical order, DESIGN.md 4.3 rule 2 ── */

const DATE_ORDER: readonly DateKind[] = ['created', 'start', 'scheduled', 'due', 'done', 'cancelled'];

/** Position in the canonical order. Zero for anything the order says nothing about. */
function canonicalRank(segment: Segment): number {
  switch (segment.kind) {
    case 'priority':
      return 1;
    case 'date':
      return 2 + DATE_ORDER.indexOf(segment.dateKind);
    // Recurrence and dependencies, which the order puts together after the dates.
    case 'preserved':
      return 8;
    case 'links':
      return 9;
    case 'tag':
      return 10;
    case 'blockId':
      return 11;
    default:
      return 0;
  }
}

/**
 * Inserts a token that was absent, in canonical order: immediately after the last
 * token it should follow, and before the first token it should precede.
 *
 * Both halves matter, because a line is not obliged to be in canonical order
 * already. `#atlas 📅 2026-07-20` gaining a done date anchors on the due date and
 * lands at the end, which is the shape the vault's completed lines have; going by
 * the first later token alone would put `✅` ahead of the `📅` it must follow.
 */
function inserted(layout: readonly Segment[], token: Segment): Segment[] {
  const rank = canonicalRank(token);
  const out = [...layout];
  const space: Segment = { kind: 'space', text: ' ' };

  let anchor = -1;
  out.forEach((segment, i) => {
    const found = canonicalRank(segment);
    if (found > 0 && found <= rank) anchor = i;
  });

  for (let i = anchor + 1; i < out.length; i += 1) {
    if (canonicalRank(out[i] as Segment) <= rank) continue;
    out.splice(i, 0, token, space);
    return out;
  }

  out.splice(endOfBody(out), 0, space, token);
  return out;
}

/**
 * Past the last segment of the body: before any block ID and any trailing whitespace.
 *
 * The block ID is skipped for a caller inserting a token that sorts after it; today
 * the forward scan in `inserted` gets there first.
 */
function endOfBody(layout: readonly Segment[]): number {
  for (let i = layout.length - 1; i >= 0; i -= 1) {
    const { kind } = layout[i] as Segment;
    if (kind !== 'space' && kind !== 'blockId') return i + 1;
  }
  return layout.length;
}

/** Removes every matching token, and exactly one adjoining space with each. */
function without(layout: readonly Segment[], matches: (segment: Segment) => boolean): Segment[] {
  const out = [...layout];
  // Backwards, and re-reading `out[i]` each time: the array shrinks as tokens go,
  // so an index taken before a removal may already be past the end.
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const segment = out[i];
    if (segment === undefined || !matches(segment)) continue;
    out.splice(i, 1);
    if (i > 0 && out[i - 1]?.kind === 'space') dropOneSpace(out, i - 1);
    else if (out[i]?.kind === 'space') dropOneSpace(out, i);
  }
  return out;
}

function dropOneSpace(layout: Segment[], at: number): void {
  const segment = layout[at] as Segment;
  if (segment.text.length <= 1) layout.splice(at, 1);
  else layout[at] = { ...segment, text: segment.text.slice(1) };
}

/**
 * Reparses the mutated line, so the returned task's scalar fields are derived from
 * it rather than patched alongside it, and so a mutation that would produce a line
 * the parser cannot read back is refused instead of written.
 */
function rebuild(task: Task, layout: readonly Segment[]): Task | null {
  const line = layout.map((segment) => segment.text).join('');
  const next = parseTaskLine(line, {
    file: task.file,
    line: task.line,
    parentLine: task.parentLine,
    ...(task.section === undefined ? {} : { section: task.section }),
    ...(task.blockId === undefined ? {} : { blockId: task.blockId }),
  });
  return next !== null && next.roundTrips ? next : null;
}
