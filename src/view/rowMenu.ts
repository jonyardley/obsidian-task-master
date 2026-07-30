import { Menu } from 'obsidian';
import type { TaskMasterController } from '../controller';
import { toISODate } from '../model/mutate';
import { NORMAL_PRIORITY, type Priority, type Task } from '../model/types';

/**
 * The row's right-click menu, per DESIGN.md section 6.3.
 *
 * Lives here rather than in `TaskRow.svelte` so the components stay free of
 * Obsidian imports, and flat rather than nested because `MenuItem` has no public
 * submenu in the 1.13 API. Sections do the grouping instead.
 *
 * Move to group arrives with phase 7, and the inline editor with phase 8.
 */

const PRIORITY_LABELS: ReadonlyArray<readonly [Priority, string]> = [
  [0, 'Highest'],
  [1, 'High'],
  [2, 'Medium'],
  [NORMAL_PRIORITY, 'Normal'],
  [4, 'Low'],
  [5, 'Lowest'],
];

export function showRowMenu(
  event: MouseEvent,
  task: Task,
  controller: TaskMasterController,
): void {
  const menu = new Menu();
  const editable = task.roundTrips;

  menu.addItem((item) =>
    item
      .setSection('status')
      .setTitle(task.status === 'done' ? 'Mark as not done' : 'Complete')
      .setIcon(task.status === 'done' ? 'rotate-ccw' : 'check')
      .setDisabled(!editable)
      .onClick(() => void controller.toggleComplete(task)),
  );

  for (const [priority, label] of PRIORITY_LABELS) {
    menu.addItem((item) =>
      item
        .setSection('priority')
        .setTitle(`Priority: ${label.toLowerCase()}`)
        .setChecked(task.priority === priority)
        .setDisabled(!editable)
        .onClick(() => void controller.setPriority(task, priority)),
    );
  }

  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  menu.addItem((item) =>
    item
      .setSection('due')
      .setTitle('Due today')
      .setIcon('calendar')
      .setDisabled(!editable)
      .onClick(() => void controller.setDue(task, toISODate(today))),
  );
  menu.addItem((item) =>
    item
      .setSection('due')
      .setTitle('Due tomorrow')
      .setDisabled(!editable)
      .onClick(() => void controller.setDue(task, toISODate(tomorrow))),
  );
  menu.addItem((item) =>
    item
      .setSection('due')
      .setTitle('Clear due date')
      .setDisabled(!editable || task.dates.due === undefined)
      .onClick(() => void controller.setDue(task, null)),
  );

  menu.addItem((item) =>
    item
      .setSection('open')
      .setTitle('Open in file')
      .setIcon('file-text')
      .onClick(() => void controller.openTask(task)),
  );
  menu.addItem((item) =>
    item
      .setSection('open')
      .setTitle('Copy task text')
      .setIcon('copy')
      .onClick(() => void controller.copyTaskText(task)),
  );

  menu.showAtMouseEvent(event);
}
