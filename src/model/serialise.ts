import type { Task } from './types';

/**
 * Rebuilds a task line from its layout.
 *
 * The layout covers the whole line, so this is a concatenation rather than a
 * canonical re-emission of tokens: token order and inter-token whitespace stay
 * properties of the line, not of the model. See DESIGN.md section 4.3 rule 1.
 *
 * Mutations in `mutate.ts` work by editing the layout, so they inherit that
 * property: everything they do not touch comes back out byte for byte.
 */
export function serialiseTask(task: Task): string {
  let out = '';
  for (const segment of task.layout) out += segment.text;
  return out;
}
