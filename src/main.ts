import { Plugin } from 'obsidian';
import { TaskMasterView, VIEW_TYPE_TASK_MASTER } from './view/TaskMasterView';

export default class TaskMasterPlugin extends Plugin {
  override async onload(): Promise<void> {
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
