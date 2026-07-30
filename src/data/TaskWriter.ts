import { Notice, type App, type TFile } from 'obsidian';
import { serialiseTask } from '../model/serialise';
import type { Task } from '../model/types';

/**
 * The write path, per DESIGN.md section 5.4. The only thing in the plugin that
 * changes a note.
 *
 * Every write re-resolves its target, verifies the line still reads as it did when
 * it was indexed, changes exactly that line, and logs what it did. The vault holds
 * Jon's real notes and nothing in this project backs them up, so a refused write is
 * always the right answer when anything looks wrong: see PLAN.md rule 3.
 */

export type WriteOutcome =
  | { status: 'written'; task: Task }
  /** The mutation was a no-op, so nothing was written. */
  | { status: 'unchanged' }
  /** The line does not round-trip, or the mutation declined. */
  | { status: 'refused' }
  /** The line changed on disk since it was indexed. */
  | { status: 'stale' }
  | { status: 'missing' };

export type Mutation = (task: Task) => Task | null;

export class TaskWriter {
  /** One chain per file, so two fast edits to one file cannot interleave. */
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(
    private readonly app: App,
    /** Reindex a file whose contents turned out not to match the index. */
    private readonly refresh: (path: string) => void,
  ) {}

  async apply(task: Task, mutate: Mutation): Promise<WriteOutcome> {
    if (!task.roundTrips) return { status: 'refused' };
    return await this.enqueue(task.file, () => this.write(task, mutate));
  }

  private async write(task: Task, mutate: Mutation): Promise<WriteOutcome> {
    const file = this.app.vault.getFileByPath(task.file);
    if (file === null) {
      console.error(`[task-master] ${task.file} no longer exists, write dropped`);
      return { status: 'missing' };
    }

    const line = this.resolveLine(file, task);
    if (lineAt(await this.app.vault.read(file), line) !== task.raw) return this.abort(task.file);

    const next = mutate(task);
    if (next === null) return { status: 'refused' };
    const after = serialiseTask(next);
    if (after === task.raw) return { status: 'unchanged' };

    let stale = false;
    await this.app.vault.process(file, (data) => {
      // Verified again in here. `process` is Obsidian's atomic read-modify-write, so
      // this is the only point at which "the line still says what we think" and "the
      // line is replaced" cannot be separated by an edit from anywhere else.
      if (lineAt(data, line) !== task.raw) {
        stale = true;
        return data;
      }
      console.log('[task-master] write', {
        file: task.file,
        line: line + 1,
        before: task.raw,
        after,
      });
      return replaceLine(data, line, after);
    });

    return stale ? this.abort(task.file) : { status: 'written', task: next };
  }

  /**
   * A block ID is identity, so it survives the line moving. Absent one, the recorded
   * line number is all there is, and the byte comparison in `write` is what makes
   * that safe.
   */
  private resolveLine(file: TFile, task: Task): number {
    if (task.blockId === undefined) return task.line;
    const item = this.app.metadataCache
      .getFileCache(file)
      ?.listItems?.find((candidate) => candidate.id === task.blockId);
    // A cache miss falls back to the recorded line rather than aborting: the cache
    // lags a write Obsidian has not settled yet, and the byte comparison is the
    // stronger check either way.
    return item?.position.start.line ?? task.line;
  }

  private abort(path: string): WriteOutcome {
    new Notice('Task changed on disk, view refreshed');
    this.refresh(path);
    return { status: 'stale' };
  }

  private enqueue<T>(path: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(path) ?? Promise.resolve();
    // Both arms run `work`: a rejected predecessor must not strand everything queued
    // behind it.
    const result = previous.then(work, work);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(path, settled);
    void settled.then(() => {
      if (this.tails.get(path) === settled) this.tails.delete(path);
    });
    return result;
  }
}

/** Without its carriage return, matching what `TaskIndex` put in `Task.raw`. */
function lineAt(text: string, line: number): string | undefined {
  return text.split('\n')[line]?.replace(/\r$/, '');
}

/** Restores the line's own ending, so a CRLF file stays a CRLF file. */
function replaceLine(text: string, line: number, replacement: string): string {
  const lines = text.split('\n');
  const crlf = lines[line]?.endsWith('\r') === true;
  lines[line] = crlf ? `${replacement}\r` : replacement;
  return lines.join('\n');
}
