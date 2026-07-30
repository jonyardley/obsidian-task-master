import type { App, CachedMetadata, HeadingCache, ListItemCache } from 'obsidian';
import { TAbstractFile, TFile, type EventRef } from './obsidian-stub';

/**
 * A vault the tests can drive: add files, fire the events Obsidian fires, and
 * make a read hang or fail on demand.
 *
 * The metadata cache is derived from the text by `cacheFor` below, mirroring the
 * parts of Obsidian's behaviour `TaskIndex` depends on. That means a test asserting
 * "a fenced task is not indexed" proves that `TaskIndex` indexes only what the
 * cache reports, which is the invariant that matters, rather than proving anything
 * about Obsidian's own fence handling.
 */
export class FakeVault {
  private readonly files = new Map<string, string>();
  private readonly handlers = new Map<string, Array<(...args: never[]) => void>>();
  /** Paths whose next `cachedRead` rejects. */
  readonly failingReads = new Set<string>();
  /** Paths whose `cachedRead` waits for `release` before resolving. */
  private readonly held = new Map<string, () => void>();
  layoutReady = false;
  /**
   * Runs as `process` is entered, before it reads. Lets a test land an edit in the
   * window between a write's verifying read and its atomic callback, which is the
   * only thing the second check inside that callback exists for.
   */
  beforeProcess: ((path: string) => void) | null = null;

  write(path: string, text: string): TFile {
    this.files.set(path, text);
    return new TFile(path);
  }

  /** Takes a file away without firing anything, as something outside Obsidian would. */
  remove(path: string): void {
    this.files.delete(path);
  }

  /** The current text, without going through a read. */
  text(path: string): string {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`no such file: ${path}`);
    return text;
  }

  /** Makes `cachedRead(path)` hang. Returns a function that lets it finish. */
  hold(path: string): () => void {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.held.set(path, () => {
      this.held.delete(path);
      release();
    });
    this.gates.set(path, gate);
    return () => this.held.get(path)?.();
  }

  private readonly gates = new Map<string, Promise<void>>();

  get app(): App {
    const fake = this;
    return {
      vault: {
        getMarkdownFiles: (): TFile[] =>
          [...this.files.keys()].filter((path) => path.endsWith('.md')).map((p) => new TFile(p)),
        cachedRead: async (file: TFile): Promise<string> => {
          // Snapshotted before the await, deliberately. A real read observes the
          // file as it was when the read began, which is what makes a slow scan
          // able to overwrite a newer incremental result with stale text.
          const atCallTime = this.files.get(file.path);
          const gate = this.gates.get(file.path);
          if (gate) await gate;
          if (this.failingReads.has(file.path)) {
            throw new Error(`fake read failure: ${file.path}`);
          }
          if (atCallTime === undefined) throw new Error(`no such file: ${file.path}`);
          return atCallTime;
        },
        getFileByPath: (path: string): TFile | null =>
          this.files.has(path) ? new TFile(path) : null,
        // Unlike cachedRead, a real `read` goes to disk, which is what the write
        // path verifies against.
        read: async (file: TFile): Promise<string> => {
          const text = this.files.get(file.path);
          if (text === undefined) throw new Error(`no such file: ${file.path}`);
          return text;
        },
        /**
         * Obsidian's read-modify-write, which fires `changed` once it has written.
         *
         * Deliberately snapshots the text and then yields before storing, so two
         * writes to one file that are not serialised both start from the same text
         * and the second silently loses the first. That is the race `TaskWriter`'s
         * per-file queue exists to prevent, and without the yield a test of it
         * could not fail.
         */
        process: async (file: TFile, fn: (data: string) => string): Promise<string> => {
          this.beforeProcess?.(file.path);
          const before = this.files.get(file.path);
          if (before === undefined) throw new Error(`no such file: ${file.path}`);
          await Promise.resolve();
          const after = fn(before);
          this.changed(file.path, after);
          return after;
        },
        on: (name: string, handler: (...args: never[]) => void): EventRef =>
          this.subscribe(`vault:${name}`, handler),
      },
      metadataCache: {
        getFileCache: (file: TFile): CachedMetadata | null => {
          const text = this.files.get(file.path);
          return text === undefined ? null : cacheFor(text);
        },
        on: (name: string, handler: (...args: never[]) => void): EventRef =>
          this.subscribe(`metadata:${name}`, handler),
      },
      workspace: {
        get layoutReady(): boolean {
          return fake.layoutReady;
        },
      },
      // Only the three above are reachable from src/data/.
    } as unknown as App;
  }

  /** Obsidian hands `changed` the new text alongside the fresh cache. */
  changed(path: string, text: string): void {
    this.files.set(path, text);
    this.fire('metadata:changed', new TFile(path), text, cacheFor(text));
  }

  resolved(): void {
    this.fire('metadata:resolved');
  }

  delete(path: string): void {
    this.files.delete(path);
    this.fire('vault:delete', new TFile(path));
  }

  rename(file: TAbstractFile, oldPath: string): void {
    const text = this.files.get(oldPath);
    if (text !== undefined) {
      this.files.delete(oldPath);
      this.files.set(file.path, text);
    }
    this.fire('vault:rename', file, oldPath);
  }

  /** Moves every file under `oldPrefix` and fires one folder rename, as Obsidian does. */
  renameFolder(oldPrefix: string, newPrefix: string, folder: TAbstractFile): void {
    for (const [path, text] of [...this.files]) {
      if (!path.startsWith(`${oldPrefix}/`)) continue;
      this.files.delete(path);
      this.files.set(path.replace(oldPrefix, newPrefix), text);
    }
    this.fire('vault:rename', folder, oldPrefix);
  }

  private subscribe(key: string, handler: (...args: never[]) => void): EventRef {
    const list = this.handlers.get(key) ?? [];
    list.push(handler);
    this.handlers.set(key, list);
    return {
      detach: () => {
        const current = this.handlers.get(key) ?? [];
        this.handlers.set(
          key,
          current.filter((entry) => entry !== handler),
        );
      },
    };
  }

  private fire(key: string, ...args: unknown[]): void {
    for (const handler of [...(this.handlers.get(key) ?? [])]) {
      (handler as (...a: unknown[]) => void)(...args);
    }
  }
}

const TASK = /^(\s*)[-*+] \[(.)\]/;
const LIST = /^(\s*)[-*+] /;
const HEADING = /^(#{1,6}) (.*)$/;
const BLOCK_ID = /\s\^([A-Za-z0-9_-]+)\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** Mirrors the parts of Obsidian's cache that `TaskIndex` reads. */
export function cacheFor(text: string): CachedMetadata {
  const listItems: ListItemCache[] = [];
  const headings: HeadingCache[] = [];
  let inFence = false;
  /** Indent width -> line of the nearest enclosing list item. */
  const openAt = new Map<number, number>();

  text.split('\n').forEach((raw, line) => {
    if (FENCE.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const heading = HEADING.exec(raw);
    if (heading) {
      headings.push({
        heading: heading[2] ?? '',
        level: (heading[1] ?? '#').length,
        position: span(line),
      } as HeadingCache);
      return;
    }

    const list = LIST.exec(raw) ?? TASK.exec(raw);
    if (!list) return;

    const indent = (list[1] ?? '').length;
    let parent = -line - 1;
    for (const [width, at] of openAt) {
      if (width < indent) parent = at;
    }
    openAt.set(indent, line);
    for (const width of [...openAt.keys()]) {
      if (width > indent) openAt.delete(width);
    }

    const task = TASK.exec(raw);
    const id = BLOCK_ID.exec(raw)?.[1];
    listItems.push({
      position: span(line),
      parent,
      ...(task ? { task: task[2] } : {}),
      ...(id === undefined ? {} : { id }),
    } as ListItemCache);
  });

  return { listItems, headings } as CachedMetadata;
}

function span(line: number): HeadingCache['position'] {
  return {
    start: { line, col: 0, offset: 0 },
    end: { line, col: 0, offset: 0 },
  };
}
