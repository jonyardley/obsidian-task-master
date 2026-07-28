/**
 * The parsed representation of a task line, per DESIGN.md section 4.2.
 *
 * Nothing in src/model/ may import from Obsidian. See DESIGN.md section 5.2.
 */

export type Priority = 0 | 1 | 2 | 3 | 4 | 5; // 0 highest, 3 normal, 5 lowest
export type TaskStatus = 'open' | 'done' | 'cancelled' | 'custom';
export type DateKind = 'due' | 'scheduled' | 'start' | 'created' | 'done' | 'cancelled';

/** Priority when no glyph is present. */
export const NORMAL_PRIORITY: Priority = 3;

export interface ContextLink {
  kind: 'wikilink' | 'external';
  /** Wikilink target, or the URL of an external link. */
  target: string;
  /** Wikilink alias, or the link text of an external link. */
  alias?: string;
  /** True when the alias is exactly 'source': this link is provenance. */
  isSource: boolean;
}

/**
 * A contiguous run of the raw line.
 *
 * Parsing decomposes a line into segments that cover it completely, with no gaps
 * and no overlaps, so that concatenating every `text` reproduces the line exactly.
 * That is what makes the round-trip guarantee in DESIGN.md section 4.3 achievable:
 * serialisation walks the segments rather than re-emitting tokens in a canonical
 * order, so token order and inter-token whitespace stay properties of the line
 * rather than of the model.
 */
export type SegmentKind =
  /** Leading whitespace. */
  | 'indent'
  /** The list marker and checkbox, e.g. "- [ ]". */
  | 'marker'
  /** Description text, verbatim, including any inline wikilinks. */
  | 'text'
  /** Whitespace between other segments. */
  | 'space'
  | 'priority'
  | 'date'
  | 'tag'
  /** A whole `🔗` run, separator included. */
  | 'links'
  /** A recognised but unmanaged token: `🔁`, `🆔`, `⛔`. */
  | 'preserved'
  /** A trailing `^blockId`. */
  | 'blockId';

interface SegmentBase {
  kind: SegmentKind;
  /** The verbatim source text of this segment. */
  text: string;
}

export interface PrioritySegment extends SegmentBase {
  kind: 'priority';
  priority: Priority;
}

export interface DateSegment extends SegmentBase {
  kind: 'date';
  dateKind: DateKind;
  /** ISO YYYY-MM-DD. */
  value: string;
}

export interface TagSegment extends SegmentBase {
  kind: 'tag';
  /** Without the leading '#'. */
  tag: string;
}

export interface LinksSegment extends SegmentBase {
  kind: 'links';
  links: ContextLink[];
}

export interface BlockIdSegment extends SegmentBase {
  kind: 'blockId';
  /** Without the leading '^'. */
  blockId: string;
}

export interface PlainSegment extends SegmentBase {
  kind: 'indent' | 'marker' | 'text' | 'space' | 'preserved';
}

export type Segment =
  | PlainSegment
  | PrioritySegment
  | DateSegment
  | TagSegment
  | LinksSegment
  | BlockIdSegment;

export interface Task {
  /** Stable identity. Block ID when present, else `${file}::${line}`. */
  id: string;
  blockId?: string;

  file: string; // vault-relative path
  line: number; // 0-indexed
  indent: string; // leading whitespace, verbatim
  parentLine: number; // from ListItemCache.parent
  section?: string; // nearest preceding heading text

  raw: string; // the original line, verbatim
  roundTrips: boolean; // serialise(this) === raw

  status: TaskStatus;
  statusChar: string;
  description: string; // metadata stripped, inline links intact
  tags: string[]; // without the leading '#'
  priority: Priority;
  dates: Partial<Record<DateKind, string>>; // ISO YYYY-MM-DD
  contextLinks: ContextLink[];

  /** Tokens recognised but not managed (🔁, 🆔, ⛔), verbatim, in order. */
  preserved: string[];

  /**
   * Ordered segments covering the whole of `raw`. The substrate for
   * serialisation and mutation. See DESIGN.md section 4.3 rule 1.
   */
  layout: Segment[];
}

export interface GroupDef {
  id: string; // plugin-owned, stable, e.g. "g-focus"
  label: string; // "Focus"
  tag: string; // "focus", without '#'
  collapsed: boolean;
  order: number;
}

export interface Settings {
  excludedPaths: string[]; // default ['Settings', 'Templates']
  addDoneDate: boolean; // default true
  showCancelled: boolean; // default false
  doneSectionLimit: number; // default 50
  fallbackSort: 'priority' | 'due' | 'file'; // default 'priority'
}

export interface StoreData {
  version: 1;
  /** blockId -> sparse rank. Absent means unranked. */
  order: Record<string, number>;
  groups: GroupDef[];
  /** Collapse state for the virtual groups, which have no GroupDef. */
  virtualCollapsed: { unsorted: boolean; done: boolean };
  settings: Settings;
}
