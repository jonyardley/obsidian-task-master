import {
  Component,
  Notice,
  TFile,
  type App,
  type CachedMetadata,
  type HeadingCache,
  type ListItemCache,
} from 'obsidian';
import { parseTaskLine } from '../model/parse';
import { isExcludedPath } from '../model/paths';
import type { Task } from '../model/types';

/**
 * Every task in the vault, kept current. See DESIGN.md section 5.3.
 *
 * A `Component` so the handlers registered in `onload` unregister on unload.
 * Add it with `plugin.addChild(index)`.
 */
export class TaskIndex extends Component {
  private readonly byFile = new Map<string, Task[]>();
  private readonly listeners = new Set<(path?: string) => void>();
  private cacheResolved = false;
  private scanComplete = false;
  /** Invalidates results from a scan that a later scan has superseded. */
  private scanGeneration = 0;
  /**
   * Bumped per path whenever something newer than an in-flight read happens to it.
   * A scan's read observes the file as it was when the read began, so without this
   * a slow scan lands after an edit and overwrites the fresh parse with stale text.
   */
  private readonly writeSeq = new Map<string, number>();
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly app: App,
    private readonly excludedPaths: () => readonly string[],
  ) {
    super();
  }

  /**
   * Both halves matter: Obsidian's cache must be resolved *and* this index must
   * have finished a scan. DESIGN.md section 4.5 hangs order GC off this flag, and
   * a GC against a partial index silently drops every persisted rank, which
   * section 7 forbids.
   */
  get isFullyIndexed(): boolean {
    return this.cacheResolved && this.scanComplete;
  }

  override onload(): void {
    const { metadataCache, vault, workspace } = this.app;

    this.registerEvent(
      metadataCache.on('changed', (file, data, cache) => {
        this.reindexFile(file, data, cache);
      }),
    );

    this.registerEvent(
      vault.on('delete', (file) => {
        if (this.forget(file.path)) this.emit(file.path);
      }),
    );

    this.registerEvent(
      vault.on('rename', (file, oldPath) => {
        this.forget(oldPath);
        if (!(file instanceof TFile)) {
          this.emit(oldPath);
          return;
        }
        void this.scanFile(file, this.scanGeneration)
          .catch(() => undefined)
          .then(() => this.emit(file.path));
      }),
    );

    this.registerEvent(
      metadataCache.on('resolved', () => {
        // Fires again after every settled edit, not only after the initial load,
        // so a whole-vault emit here would undo incremental indexing.
        if (this.cacheResolved) return;
        this.cacheResolved = true;
        this.emit();
      }),
    );

    // A plugin enabled after startup has already missed the first `resolved`,
    // and the next one is an edit away.
    if (workspace.layoutReady) this.cacheResolved = true;
  }

  override onunload(): void {
    this.byFile.clear();
    this.listeners.clear();
  }

  /** Returns an unsubscribe function. `path` is absent for a whole-vault change. */
  onChange(listener: (path?: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  tasksIn(path: string): readonly Task[] {
    return this.byFile.get(path) ?? [];
  }

  /** Ordered by file path then line. */
  snapshot(): Task[] {
    return [...this.byFile.keys()].sort().flatMap((path) => this.byFile.get(path) ?? []);
  }

  /**
   * Reparses one file, for the write path's stale-read abort: the line on disk did
   * not match the index, and no Obsidian event is coming to correct that.
   *
   * Best effort by nature. Either the cache or the cached read may still be pre-edit
   * at the moment an abort fires, so this can briefly pair fresh text with stale line
   * numbers; the `changed` event that follows the edit corrects it.
   */
  async refresh(path: string): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (file === null) {
      this.forget(path);
      this.emit(path);
      return;
    }
    this.touch(path);
    await this.scanFile(file, this.scanGeneration).catch(() => undefined);
    this.emit(path);
  }

  /** Concurrent callers share one scan rather than clearing each other's results. */
  async scanVault(): Promise<void> {
    this.inFlight ??= this.runScan();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async runScan(): Promise<void> {
    const generation = ++this.scanGeneration;
    this.scanComplete = false;
    this.byFile.clear();

    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => !isExcludedPath(file.path, this.excludedPaths()));

    // allSettled, not all: one unreadable file must not abandon the scan and
    // leave a partial index behind that reports itself complete.
    const results = await Promise.allSettled(files.map((file) => this.scanFile(file, generation)));
    if (generation !== this.scanGeneration) return;

    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      new Notice(`Task Master: ${failed} file(s) could not be read, see the console.`);
    }

    this.scanComplete = true;
    this.emit();
  }

  private async scanFile(file: TFile, generation: number): Promise<void> {
    if (isExcludedPath(file.path, this.excludedPaths())) {
      this.byFile.delete(file.path);
      return;
    }
    const cache = this.app.metadataCache.getFileCache(file);
    if (cache === null || !cache.listItems?.length) {
      this.byFile.delete(file.path);
      return;
    }

    const seenAt = this.writeSeq.get(file.path);
    let text: string;
    try {
      text = await this.app.vault.cachedRead(file);
    } catch (error) {
      // Reachable: the file can be renamed or deleted between the cache read and
      // this one, by Sync or by anything outside Obsidian.
      console.error(`[task-master] could not read ${file.path}`, error);
      throw error;
    }

    // A newer scan has already cleared the map; storing now would resurrect a
    // stale entry that nothing will remove.
    if (generation !== this.scanGeneration) return;
    // Something newer happened to this path while the read was outstanding, so
    // `text` is already history.
    if (this.writeSeq.get(file.path) !== seenAt) return;
    this.store(file.path, tasksFrom(file.path, text, cache));
  }

  /**
   * Synchronous on purpose. `metadataCache.on('changed')` hands over the file
   * text alongside the cache, so re-reading would risk pairing the cache from one
   * edit with the text from the next, and `Task.line` is what the phase 5 write
   * path resolves against for a task with no block ID.
   */
  private reindexFile(file: TFile, text: string, cache: CachedMetadata): void {
    this.touch(file.path);
    if (isExcludedPath(file.path, this.excludedPaths())) {
      if (this.byFile.delete(file.path)) this.emit(file.path);
      return;
    }
    this.store(file.path, tasksFrom(file.path, text, cache));
    this.emit(file.path);
  }

  private touch(path: string): void {
    this.writeSeq.set(path, (this.writeSeq.get(path) ?? 0) + 1);
  }

  /** Drops `path` and, when it names a folder, everything beneath it. */
  private forget(path: string): boolean {
    this.touch(path);
    let removed = this.byFile.delete(path);
    const prefix = `${path}/`;
    for (const key of this.byFile.keys()) {
      if (!key.startsWith(prefix)) continue;
      this.touch(key);
      removed = this.byFile.delete(key) || removed;
    }
    return removed;
  }

  private store(path: string, tasks: Task[]): void {
    if (tasks.length === 0) this.byFile.delete(path);
    else this.byFile.set(path, tasks);
  }

  private emit(path?: string): void {
    for (const listener of this.listeners) listener(path);
  }
}

/**
 * Task lines come from `ListItemCache` entries carrying a `task` property, never
 * from a regex sweep: that is what excludes tasks inside code fences and handles
 * nesting, for free. See DESIGN.md section 5.3.
 */
function tasksFrom(path: string, text: string, cache: CachedMetadata): Task[] {
  const lines = text.split('\n');
  const headings = cache.headings ?? [];
  const tasks: Task[] = [];

  for (const item of cache.listItems ?? []) {
    if (item.task === undefined) continue;
    const line = item.position.start.line;
    // A CRLF file leaves a '\r' on the end of every line, which would become part of
    // the last description word and take a token appended after it into the middle of
    // the line. `TaskWriter` puts the '\r' back on the line it writes.
    const raw = lines[line]?.replace(/\r$/, '');
    if (raw === undefined) continue;

    const task = parseTaskLine(raw, {
      file: path,
      line,
      parentLine: item.parent,
      ...sectionOf(headings, line),
      ...blockIdOf(item),
    });
    if (task !== null) tasks.push(task);
  }

  return tasks;
}

function sectionOf(headings: readonly HeadingCache[], line: number): { section?: string } {
  let nearest: HeadingCache | undefined;
  for (const heading of headings) {
    if (heading.position.start.line >= line) break;
    nearest = heading;
  }
  return nearest ? { section: nearest.heading } : {};
}

function blockIdOf(item: ListItemCache): { blockId?: string } {
  return item.id === undefined ? {} : { blockId: item.id };
}
