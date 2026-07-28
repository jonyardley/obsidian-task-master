import {
  Component,
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
 * A `Component`, so the event handlers registered in `onload` unregister
 * themselves when the plugin unloads. Add it with `plugin.addChild(index)`.
 */
export class TaskIndex extends Component {
  /** Vault path -> that file's tasks, in line order. */
  private readonly byFile = new Map<string, Task[]>();
  private readonly listeners = new Set<(path?: string) => void>();
  private fullyIndexed = false;

  constructor(
    private readonly app: App,
    private readonly excludedPaths: () => readonly string[],
  ) {
    super();
  }

  /**
   * True once Obsidian has resolved the whole metadata cache at least once.
   * Until then the index is real but incomplete, and the view has to say so
   * rather than imply the vault holds fewer tasks than it does.
   */
  get isFullyIndexed(): boolean {
    return this.fullyIndexed;
  }

  override onload(): void {
    const { metadataCache, vault, workspace } = this.app;

    this.registerEvent(
      metadataCache.on('changed', (file, _data, cache) => {
        this.reindexFile(file, cache);
      }),
    );

    this.registerEvent(
      vault.on('delete', (file) => {
        if (this.byFile.delete(file.path)) this.emit(file.path);
      }),
    );

    this.registerEvent(
      vault.on('rename', (file, oldPath) => {
        // The tasks are unchanged but their `file` and `id` are not, and the old
        // path may have been excluded while the new one is not.
        this.byFile.delete(oldPath);
        if (file instanceof TFile) void this.scanFile(file).then(() => this.emit(file.path));
        else this.emit(oldPath);
      }),
    );

    this.registerEvent(
      metadataCache.on('resolved', () => {
        this.fullyIndexed = true;
        this.emit();
      }),
    );

    // `resolved` fires once, while Obsidian starts up. A plugin enabled after
    // that never sees it, so a late load reads the state off the workspace
    // instead. Without this the flag stays false for the whole session and the
    // view would permanently claim an incomplete index.
    if (workspace.layoutReady) this.fullyIndexed = true;
  }

  override onunload(): void {
    this.byFile.clear();
    this.listeners.clear();
  }

  /**
   * Fires after every change to the index, with the path that changed when the
   * change came from one file. Returns an unsubscribe function.
   */
  onChange(listener: (path?: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** That file's tasks, in line order. */
  tasksIn(path: string): readonly Task[] {
    return this.byFile.get(path) ?? [];
  }

  /** Every task in the vault, ordered by file path then line. */
  snapshot(): Task[] {
    return [...this.byFile.keys()].sort().flatMap((path) => this.byFile.get(path) ?? []);
  }

  /**
   * The initial scan, run on view open rather than plugin load so startup stays
   * cheap. See DESIGN.md section 5.3.
   */
  async scanVault(): Promise<void> {
    this.byFile.clear();
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => !isExcludedPath(file.path, this.excludedPaths()));

    await Promise.all(files.map((file) => this.scanFile(file)));
    this.emit();
  }

  private async scanFile(file: TFile): Promise<void> {
    if (isExcludedPath(file.path, this.excludedPaths())) {
      this.byFile.delete(file.path);
      return;
    }
    const cache = this.app.metadataCache.getFileCache(file);
    if (cache === null || !cache.listItems?.length) {
      this.byFile.delete(file.path);
      return;
    }
    const text = await this.app.vault.cachedRead(file);
    this.store(file.path, tasksFrom(file.path, text, cache));
  }

  /**
   * The incremental path. `metadataCache.on('changed')` hands over the fresh
   * cache and the file content is already read, so this needs no vault read.
   */
  private reindexFile(file: TFile, cache: CachedMetadata): void {
    if (isExcludedPath(file.path, this.excludedPaths())) {
      if (this.byFile.delete(file.path)) this.emit(file.path);
      return;
    }
    void this.app.vault.cachedRead(file).then((text) => {
      this.store(file.path, tasksFrom(file.path, text, cache));
      this.emit(file.path);
    });
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
 * from a regex sweep over the text: that is what gets tasks inside code fences
 * excluded, and nesting handled, for free. See DESIGN.md section 5.3.
 */
function tasksFrom(path: string, text: string, cache: CachedMetadata): Task[] {
  const lines = text.split('\n');
  const headings = cache.headings ?? [];
  const tasks: Task[] = [];

  for (const item of cache.listItems ?? []) {
    if (item.task === undefined) continue;
    const line = item.position.start.line;
    const raw = lines[line];
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

/** The nearest heading above `line`, if any. */
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
