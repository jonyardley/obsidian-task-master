import { Component, debounce, type App } from 'obsidian';
import type { Store } from './data/Store';
import type { TaskIndex } from './data/TaskIndex';
import { assembleSections, type Section } from './model/filter';
import {
  EMPTY_FILTER,
  isFiltering,
  isVisible,
  tagFacets,
  type FilterState,
  type TagFacet,
  type TagMode,
} from './model/query';
import type { Settings, Task } from './model/types';

/**
 * The only thing the view calls. Owns the index and the store, hands the view a
 * snapshot, and takes intents back. See DESIGN.md section 5.2.
 *
 * Nothing here writes to the vault. `TaskWriter` arrives in phase 5.
 */

export interface ViewSnapshot {
  sections: Section[];
  /** False until Obsidian's cache has resolved and a scan has finished. */
  ready: boolean;
  /** Both counted from the sections, so they always reconcile with what is shown. */
  openCount: number;
  doneCount: number;
  /** The same two with the filter ignored. */
  totalOpenCount: number;
  totalDoneCount: number;
  /** Whether the Done section is showing past its cap. */
  showAllDone: boolean;
  filter: FilterState;
  /** True when the filter narrows anything, so the view can offer to clear it. */
  filtering: boolean;
  /** Every tag in the index, ordered by frequency, for the toolbar's multi-select. */
  tagFacets: TagFacet[];
  /** The sort actually in force: the toolbar's choice, else the setting. */
  sort: Settings['fallbackSort'];
  /** The Done section's expanded state, which is what the show-done toggle drives. */
  showDone: boolean;
}

export class TaskMasterController extends Component {
  private readonly listeners = new Set<() => void>();
  private cached: ViewSnapshot | null = null;
  private showAllDone = false;
  /** UI state, not a preference: it resets when the view closes. DESIGN.md section 6.4. */
  private filter: FilterState = EMPTY_FILTER;

  /**
   * Debounced per DESIGN.md section 5.3, so typing in a Daily Note with the view
   * open in another tab does not make it flicker.
   */
  private readonly publish = debounce(
    () => {
      this.cached = null;
      for (const listener of this.listeners) listener();
    },
    50,
    false,
  );

  constructor(
    private readonly app: App,
    private readonly index: TaskIndex,
    private readonly store: Store,
  ) {
    super();
  }

  override onload(): void {
    this.register(this.index.onChange(() => this.publish()));
  }

  override onunload(): void {
    this.listeners.clear();
  }

  /**
   * Called when the view opens rather than on plugin load, so startup stays cheap.
   * See DESIGN.md section 5.3. Concurrent callers share one scan.
   */
  async start(): Promise<void> {
    await this.index.scanVault();
  }

  /** Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): ViewSnapshot {
    this.cached ??= this.assemble();
    return this.cached;
  }

  async toggleSection(section: Section): Promise<void> {
    if (section.kind === 'group') await this.store.setGroupCollapsed(section.id, !section.collapsed);
    else await this.store.setVirtualCollapsed(section.kind, !section.collapsed);
    this.invalidate();
  }

  toggleShowAllDone(): void {
    this.showAllDone = !this.showAllDone;
    this.invalidate();
  }

  /** The toolbar's show-done toggle and the Done header drive the same state. */
  async setShowDone(show: boolean): Promise<void> {
    await this.store.setVirtualCollapsed('done', !show);
    this.invalidate();
  }

  setSearch(search: string): void {
    this.setFilter({ search });
  }

  toggleTag(tag: string): void {
    const tags = this.filter.tags.includes(tag)
      ? this.filter.tags.filter((candidate) => candidate !== tag)
      : [...this.filter.tags, tag];
    this.setFilter({ tags });
  }

  setTagMode(tagMode: TagMode): void {
    this.setFilter({ tagMode });
  }

  setSort(sort: Settings['fallbackSort']): void {
    this.setFilter({ sort });
  }

  /** Clears everything that narrows, keeping the chosen sort, which does not. */
  clearFilter(): void {
    this.setFilter({ search: '', tags: [], tagMode: EMPTY_FILTER.tagMode });
  }

  resetFilter(): void {
    this.filter = EMPTY_FILTER;
    this.invalidate();
  }

  async openTask(task: Task): Promise<void> {
    const file = this.app.vault.getFileByPath(task.file);
    if (file === null) return;
    await this.app.workspace.getLeaf('tab').openFile(file, { eState: { line: task.line } });
  }

  async openLink(target: string, sourcePath: string): Promise<void> {
    await this.app.workspace.openLinkText(target, sourcePath, false);
  }

  private setFilter(change: Partial<FilterState>): void {
    this.filter = { ...this.filter, ...change };
    this.invalidate();
  }

  private invalidate(): void {
    this.cached = null;
    for (const listener of this.listeners) listener();
  }

  private assemble(): ViewSnapshot {
    const { groups, order, virtualCollapsed, settings } = this.store.data;
    const tasks = this.index.snapshot();
    const sections = assembleSections({
      tasks,
      groups,
      order,
      virtualCollapsed,
      settings,
      showAllDone: this.showAllDone,
      filter: this.filter,
    });

    // Counted off the sections rather than the index, so the header can never
    // disagree with what the sections below it add up to.
    const doneSection = sections.find((section) => section.kind === 'done');
    const openSections = sections.filter((section) => section.kind !== 'done');
    const sum = (of: 'count' | 'total'): number =>
      openSections.reduce((total, section) => total + section[of], 0);

    return {
      sections,
      ready: this.index.isFullyIndexed,
      openCount: sum('count'),
      doneCount: doneSection?.count ?? 0,
      totalOpenCount: sum('total'),
      totalDoneCount: doneSection?.total ?? 0,
      showAllDone: this.showAllDone,
      filter: this.filter,
      filtering: isFiltering(this.filter),
      tagFacets: tagFacets(
        tasks.filter((task) => isVisible(task, settings)),
        this.filter.tags,
      ),
      sort: this.filter.sort ?? settings.fallbackSort,
      showDone: !(doneSection?.collapsed ?? true),
    };
  }
}
