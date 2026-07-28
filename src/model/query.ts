import type { Settings, Task } from './types';

/**
 * What the toolbar controls: the tag filter, the search term, the any/all toggle
 * and the session sort. Per DESIGN.md section 6.4.
 *
 * Nothing in src/model/ may import from Obsidian. See DESIGN.md section 5.2.
 */

export type TagMode = 'any' | 'all';

export interface FilterState {
  /** Case-insensitive substring over description and file path. */
  search: string;
  /** Tags without the leading '#', matched hierarchically. */
  tags: readonly string[];
  tagMode: TagMode;
  /** Overrides `Settings.fallbackSort` for this view session only. */
  sort: Settings['fallbackSort'] | null;
}

export interface TagFacet {
  /** As first spelled in the index, so the dropdown reads like the vault. */
  tag: string;
  /** Tasks matching this facet, subtags included. */
  count: number;
}

/** Frozen: the controller hands this straight to the view, which deep-proxies it. */
export const EMPTY_FILTER: FilterState = Object.freeze({
  search: '',
  tags: Object.freeze([]),
  tagMode: 'any',
  sort: null,
});

/** True when the filter narrows anything. A sort choice is not narrowing. */
export function isFiltering(filter: FilterState): boolean {
  return filter.search.trim() !== '' || selectedTags(filter.tags).length > 0;
}

export function matchesFilter(task: Task, filter: FilterState): boolean {
  if (!matchesSearch(task, filter.search)) return false;
  return matchesTagSelection(task.tags, filter.tags, filter.tagMode);
}

/**
 * Hierarchical prefix matching: selecting `atlas` matches `atlas`, `atlas/docs`
 * and anything deeper, but not `atlasgeddon`. Case is folded, because Obsidian
 * treats `#Atlas` and `#atlas` as one tag. An empty selection matches everything.
 */
export function matchesTagSelection(
  taskTags: readonly string[],
  selected: readonly string[],
  mode: TagMode,
): boolean {
  const wanted = selectedTags(selected);
  if (wanted.length === 0) return true;

  const held = taskTags.map(fold);
  const matches = (tag: string): boolean =>
    held.some((candidate) => candidate === tag || candidate.startsWith(`${tag}/`));

  return mode === 'all' ? wanted.every(matches) : wanted.some(matches);
}

/** DESIGN.md section 4.4. */
export function isVisible(task: Task, settings: Settings): boolean {
  return task.status !== 'cancelled' || settings.showCancelled;
}

/**
 * Every tag in the index and every ancestor of one, ordered by frequency so the
 * dropdown opens on the biggest projects. Ancestors are included even when no task
 * carries one on its own, so a whole project stays selectable from its parent.
 *
 * A selected tag no task carries any more is kept, at a count of zero. Dropping it
 * would leave a selection that narrows the view to nothing and appears nowhere in
 * the list it was chosen from.
 */
export function tagFacets(tasks: readonly Task[], selected: readonly string[] = []): TagFacet[] {
  const counts = new Map<string, TagFacet>();
  for (const task of tasks) {
    // Via a set, so a line repeating a tag still counts once.
    for (const key of withAncestors(task.tags)) {
      const existing = counts.get(fold(key));
      if (existing) existing.count += 1;
      else counts.set(fold(key), { tag: key, count: 1 });
    }
  }
  for (const tag of selected) {
    if (tag.trim() !== '' && !counts.has(fold(tag))) counts.set(fold(tag), { tag, count: 0 });
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || (fold(a.tag) < fold(b.tag) ? -1 : 1),
  );
}

function matchesSearch(task: Task, search: string): boolean {
  const needle = fold(search.trim());
  if (needle === '') return true;
  return fold(task.description).includes(needle) || fold(task.file).includes(needle);
}

function selectedTags(selected: readonly string[]): string[] {
  return selected.map((tag) => fold(tag.trim())).filter((tag) => tag !== '');
}

function fold(text: string): string {
  return text.toLowerCase();
}

export function withAncestors(tags: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const tag of tags) {
    const parts = tag.split('/');
    for (let i = 1; i <= parts.length; i += 1) out.add(parts.slice(0, i).join('/'));
  }
  return out;
}
