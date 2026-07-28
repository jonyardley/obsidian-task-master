import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { mount, unmount } from 'svelte';
import App from './App.svelte';

export const VIEW_TYPE_TASK_MASTER = 'task-master-view';

export class TaskMasterView extends ItemView {
  private component: Record<string, unknown> | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPE_TASK_MASTER;
  }

  override getDisplayText(): string {
    return 'Task Master';
  }

  override getIcon(): string {
    return 'list-checks';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    // Every selector in styles.css is scoped under this class, so the view
    // cannot leak styling into the rest of Obsidian. See DESIGN.md section 6.7.
    this.contentEl.addClass('task-master-view');
    this.component = mount(App, { target: this.contentEl });
  }

  override async onClose(): Promise<void> {
    if (this.component) {
      unmount(this.component);
      this.component = null;
    }
    this.contentEl.removeClass('task-master-view');
    this.contentEl.empty();
  }
}
