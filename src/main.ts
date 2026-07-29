import { Notice, Plugin } from 'obsidian';
import { TaskMasterController } from './controller';
import { Store } from './data/Store';
import { TaskIndex } from './data/TaskIndex';
import { summariseTasks } from './model/summarise';
import { TaskMasterView, VIEW_TYPE_TASK_MASTER } from './view/TaskMasterView';

export default class TaskMasterPlugin extends Plugin {
  private index!: TaskIndex;
  private controller!: TaskMasterController;

  override async onload(): Promise<void> {
    const store = await Store.load({
      loadData: () => this.loadData(),
      saveData: (data) => this.saveData(data),
      dataDir: this.manifest.dir,
      adapter: this.app.vault.adapter,
    });

    this.index = new TaskIndex(this.app, () => store.settings.excludedPaths);
    this.addChild(this.index);

    this.controller = new TaskMasterController(this.app, this.index, store);
    this.addChild(this.controller);

    this.registerView(VIEW_TYPE_TASK_MASTER, (leaf) => new TaskMasterView(leaf, this.controller));

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
        this.dumpIndexStats();
      },
    });
  }

  /**
   * FIXME(#2): temporary, for the phase 2 and 3 gates in PLAN.md.
   *
   * Deliberately does not scan: opening the view does that, and re-scanning here
   * would mask a broken incremental handler, which is half of what the gates check.
   */
  private dumpIndexStats(): void {
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
    console.log(
      '[task-master] sections',
      this.controller.snapshot().sections.map((section) => `${section.label}: ${section.count}`),
    );

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
