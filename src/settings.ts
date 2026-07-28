import type { Settings } from './model/types';

/** Per DESIGN.md section 4.4. */
export const DEFAULT_SETTINGS: Settings = {
  excludedPaths: ['Settings', 'Templates'],
  addDoneDate: true,
  showCancelled: false,
  doneSectionLimit: 50,
  fallbackSort: 'priority',
};
