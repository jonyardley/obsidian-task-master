import { Notice, Plugin } from 'obsidian';
import { TaskIndex } from './data/TaskIndex';
import { summariseTasks } from './model/summarise';
import { DEFAULT_SETTINGS } from './settings';
import { TaskMasterView, VIEW_TYPE_TASK_MASTER } from './view/TaskMasterView';

export default class TaskMasterPlugin extends Plugin {
  private index!: TaskIndex;
  private scanned = false;

  override async onload(): Promise<void> {
    // FIXME(#3): defaults stand in until Store lands in phase 4.
    this.index = new TaskIndex(this.app, () => DEFAULT_SETTINGS.excludedPaths);
    this.addChild(this.index);

    // FIXME(#2): temporary, for the phase 2 gate. Naming the file distinguishes
    // "the handler fired" from "the file was reindexed", since a text edit leaves
    // the vault-wide total unchanged either way.
    this.register(
      this.index.onChange((path) => {
        const total = this.index.snapshot().length;
        const scope =
          path === undefined ? 'whole vault' : `${path}: ${this.index.tasksIn(path).length} tasks`;
        console.log(`[task-master] reindexed ${scope}, ${total} total`);
      }),
    );

    this.registerView(VIEW_TYPE_TASK_MASTER, (leaf) => new TaskMasterView(leaf));

    this.addRibbonIcon('list-checks', 'Task Master', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-task-view',
      name: 'Open task view',
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: 'dump-index-stats',
      name: 'Dump index stats',
      callback: () => {
        void this.dumpIndexStats();
      },
    });
  }

  /** FIXME(#2): temporary, for the phase 2 gate in PLAN.md. */
  private async dumpIndexStats(): Promise<void> {
    // Scan once only: re-scanning per dump would mask a broken incremental
    // handler, which is half of what the phase 2 gate checks.
    if (!this.scanned) {
      this.scanned = true;
      await this.index.scanVault();
    }
    const tasks = this.index.snapshot();
    const summary = summariseTasks(tasks);
    // The tag figures in DESIGN.md section 1.1 count open tasks only, so an
    // all-status rollup cannot be compared against them.
    const openSummary = summariseTasks(tasks.filter((task) => task.status === 'open'));

    console.log('[task-master] index stats', {
      total: summary.total,
      files: Object.keys(summary.byFile).length,
      fullyIndexed: this.index.isFullyIndexed,
    });
    console.log('[task-master] by status', summary.byStatus);
    console.log('[task-master] by tag, open only, subtags rolled up', openSummary.byTagWithSubtags);
    console.log('[task-master] by tag, all statuses', summary.byTagWithSubtags);
    console.log('[task-master] by file', summary.byFile);

    const { open = 0, done = 0 } = summary.byStatus;
    new Notice(`Task Master: ${open} open, ${done} done, ${summary.total} indexed`);
  }

  /**
   * Opens the view in the main editor area, reusing an existing leaf if one is
   * already open. Deliberately not a sidebar leaf: see DESIGN.md section 6.1.
   */
  private async activateView(): Promise<void> {
    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(VIEW_TYPE_TASK_MASTER);
    const first = existing[0];
    if (first) {
      await workspace.revealLeaf(first);
      return;
    }

    const leaf = workspace.getLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE_TASK_MASTER, active: true });
    await workspace.revealLeaf(leaf);
  }
}
