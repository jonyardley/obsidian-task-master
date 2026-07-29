import { Component, debounce, type App } from 'obsidian';
import type { Store } from './data/Store';
import type { TaskIndex } from './data/TaskIndex';
import { assembleSections, type Section } from './model/filter';
import type { Task } from './model/types';

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
  /** Whether the Done section is showing past its cap. */
  showAllDone: boolean;
}

export class TaskMasterController extends Component {
  private readonly listeners = new Set<() => void>();
  private cached: ViewSnapshot | null = null;
  private showAllDone = false;

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

  async openTask(task: Task): Promise<void> {
    const file = this.app.vault.getFileByPath(task.file);
    if (file === null) return;
    await this.app.workspace.getLeaf('tab').openFile(file, { eState: { line: task.line } });
  }

  async openLink(target: string, sourcePath: string): Promise<void> {
    await this.app.workspace.openLinkText(target, sourcePath, false);
  }

  private invalidate(): void {
    this.cached = null;
    for (const listener of this.listeners) listener();
  }

  private assemble(): ViewSnapshot {
    const { groups, order, virtualCollapsed, settings } = this.store.data;
    const sections = assembleSections({
      tasks: this.index.snapshot(),
      groups,
      order,
      virtualCollapsed,
      settings,
      showAllDone: this.showAllDone,
    });

    // Counted off the sections rather than the index, so the header can never
    // disagree with what the sections below it add up to.
    const done = sections.find((section) => section.kind === 'done')?.count ?? 0;
    const open = sections.reduce(
      (total, section) => (section.kind === 'done' ? total : total + section.count),
      0,
    );

    return {
      sections,
      ready: this.index.isFullyIndexed,
      openCount: open,
      doneCount: done,
      showAllDone: this.showAllDone,
    };
  }
}
