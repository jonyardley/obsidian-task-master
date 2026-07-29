import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { mount, unmount } from 'svelte';
import type { TaskMasterController } from '../controller';
import App from './App.svelte';

export const VIEW_TYPE_TASK_MASTER = 'task-master-view';

export class TaskMasterView extends ItemView {
  private component: Record<string, unknown> | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly controller: TaskMasterController,
  ) {
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
    this.component = mount(App, {
      target: this.contentEl,
      props: { controller: this.controller },
    });
    // The initial scan happens on view open rather than plugin load, so startup
    // stays cheap. See DESIGN.md section 5.3.
    void this.controller.start();
  }

  override async onClose(): Promise<void> {
    if (this.component) {
      unmount(this.component);
      this.component = null;
    }
    // After the unmount, so the reset does not push a snapshot into a component
    // that is going away. The filter is UI state, not a preference: DESIGN.md 6.4.
    this.controller.resetFilter();
    this.contentEl.removeClass('task-master-view');
    this.contentEl.empty();
  }
}
