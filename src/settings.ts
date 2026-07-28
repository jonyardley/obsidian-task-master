import type { GroupDef, Settings } from './model/types';

/** Per DESIGN.md section 4.4. */
export const DEFAULT_SETTINGS: Settings = {
  excludedPaths: ['Settings', 'Templates'],
  addDoneDate: true,
  showCancelled: false,
  doneSectionLimit: 50,
  fallbackSort: 'priority',
};

/**
 * Seeded on first run from the lane tags already in the vault, per the table in
 * DESIGN.md section 4.4. Focus and Blocked are documented conventions; Today and
 * This week match the columns of the kanban board being retired.
 */
export const DEFAULT_GROUPS: readonly GroupDef[] = [
  { id: 'g-focus', label: 'Focus', tag: 'focus', collapsed: false, order: 0 },
  { id: 'g-today', label: 'Today', tag: 'today', collapsed: false, order: 1 },
  { id: 'g-this-week', label: 'This week', tag: 'this-week', collapsed: false, order: 2 },
  { id: 'g-blocked', label: 'Blocked', tag: 'blocked', collapsed: false, order: 3 },
];
