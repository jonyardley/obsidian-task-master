import { beforeEach, describe, expect, it } from 'vitest';
import { TaskIndex } from '../src/data/TaskIndex';
import { FakeVault } from './fakeVault';
import { notices, TFolder } from './obsidian-stub';

/**
 * `data/` was outside the automated suite while it was empty. It is not empty now,
 * and `TaskWriter` writes to real notes next. See DESIGN.md section 8.1.
 *
 * These tests exist for the interleavings a manual check cannot reach: an edit
 * landing mid-scan, two scans overlapping, a read failing, a folder moving into an
 * excluded path.
 */

const EXCLUDED = ['Settings', 'Templates'];

function indexOver(vault: FakeVault, excluded: readonly string[] = EXCLUDED): TaskIndex {
  const index = new TaskIndex(vault.app, () => excluded);
  index.load();
  return index;
}

const paths = (index: TaskIndex): string[] => index.snapshot().map((task) => task.file);
const descriptions = (index: TaskIndex): string[] =>
  index.snapshot().map((task) => task.description);

let vault: FakeVault;

beforeEach(() => {
  vault = new FakeVault();
  notices.length = 0;
});

describe('the initial scan', () => {
  it('indexes tasks and skips list items that are not tasks', async () => {
    vault.write('Notes.md', '- [ ] A task\n- a bullet, not a task\n- [x] Done\n');
    const index = indexOver(vault);

    await index.scanVault();

    expect(descriptions(index)).toEqual(['A task', 'Done']);
  });

  it('indexes only what the metadata cache reports, so a fenced task is skipped', async () => {
    vault.write('Notes.md', '- [ ] Real\n\n```\n- [ ] Inside a fence\n```\n');
    const index = indexOver(vault);

    await index.scanVault();

    expect(descriptions(index)).toEqual(['Real']);
  });

  it('skips excluded paths', async () => {
    vault.write('Notes.md', '- [ ] Kept\n');
    vault.write('Settings/Guide.md', '- [ ] Dropped\n');
    vault.write('Settings-old/Guide.md', '- [ ] Also kept\n');
    const index = indexOver(vault);

    await index.scanVault();

    expect(paths(index)).toEqual(['Notes.md', 'Settings-old/Guide.md']);
  });

  it('attaches the nearest preceding heading, the block ID and the parent line', async () => {
    vault.write(
      'Notes.md',
      ['# Top', '', '## Section', '- [ ] Parent ^abc123', '  - [ ] Child', ''].join('\n'),
    );
    const index = indexOver(vault);

    await index.scanVault();
    const [parent, child] = index.snapshot();

    expect(parent?.section).toBe('Section');
    expect(parent?.blockId).toBe('abc123');
    expect(parent?.line).toBe(3);
    expect(child?.parentLine).toBe(3);
  });

  it('orders by file path then line', async () => {
    vault.write('b.md', '- [ ] From b\n');
    vault.write('a.md', '- [ ] First\n- [ ] Second\n');
    const index = indexOver(vault);

    await index.scanVault();

    expect(descriptions(index)).toEqual(['First', 'Second', 'From b']);
  });
});

describe('isFullyIndexed', () => {
  it('is false before anything has happened', () => {
    expect(indexOver(vault).isFullyIndexed).toBe(false);
  });

  it('stays false when the cache has resolved but no scan has run', () => {
    const index = indexOver(vault);

    vault.resolved();

    // DESIGN.md 4.5 hangs order GC off this flag. True here would mean GCing
    // every persisted rank against an empty index.
    expect(index.snapshot()).toEqual([]);
    expect(index.isFullyIndexed).toBe(false);
  });

  it('stays false when a scan has run but the cache has not resolved', async () => {
    vault.write('Notes.md', '- [ ] A task\n');
    const index = indexOver(vault);

    await index.scanVault();

    expect(index.isFullyIndexed).toBe(false);
  });

  it('is true once both have happened', async () => {
    vault.write('Notes.md', '- [ ] A task\n');
    const index = indexOver(vault);

    vault.resolved();
    await index.scanVault();

    expect(index.isFullyIndexed).toBe(true);
  });

  it('is true after a scan when the plugin loaded late, since resolved has been missed', async () => {
    vault.layoutReady = true;
    vault.write('Notes.md', '- [ ] A task\n');
    const index = indexOver(vault);

    await index.scanVault();

    expect(index.isFullyIndexed).toBe(true);
  });
});

describe('incremental updates', () => {
  it('reindexes one file on a change, without reading the vault again', async () => {
    vault.write('Notes.md', '- [ ] Before\n');
    const index = indexOver(vault);
    await index.scanVault();

    // A failing read proves the handler used the text the event carried.
    vault.failingReads.add('Notes.md');
    vault.changed('Notes.md', '- [ ] After\n- [ ] And another\n');

    expect(descriptions(index)).toEqual(['After', 'And another']);
  });

  it('reports the changed path to listeners, and no path for a whole-vault change', async () => {
    vault.write('Notes.md', '- [ ] A task\n');
    const index = indexOver(vault);
    const seen: Array<string | undefined> = [];
    index.onChange((path) => seen.push(path));

    await index.scanVault();
    vault.changed('Notes.md', '- [ ] Edited\n');

    expect(seen).toEqual([undefined, 'Notes.md']);
  });

  it('emits only once per settled edit, since resolved fires again after every one', async () => {
    vault.write('Notes.md', '- [ ] A task\n');
    const index = indexOver(vault);
    await index.scanVault();
    vault.resolved();

    let emits = 0;
    index.onChange(() => (emits += 1));
    vault.changed('Notes.md', '- [ ] Edited\n');
    vault.resolved();

    expect(emits).toBe(1);
  });

  it('drops a file whose tasks are all removed', async () => {
    vault.write('Notes.md', '- [ ] A task\n');
    const index = indexOver(vault);
    await index.scanVault();

    vault.changed('Notes.md', 'Just prose now.\n');

    expect(index.snapshot()).toEqual([]);
  });

  it('drops a file that has moved into an excluded path', async () => {
    vault.write('Notes.md', '- [ ] A task\n');
    const index = indexOver(vault);
    await index.scanVault();

    vault.changed('Settings/Notes.md', '- [ ] A task\n');

    expect(paths(index)).toEqual(['Notes.md']);
  });
});

describe('deletes and renames', () => {
  it('forgets a deleted file', async () => {
    vault.write('Notes.md', '- [ ] A task\n');
    const index = indexOver(vault);
    await index.scanVault();

    vault.delete('Notes.md');

    expect(index.snapshot()).toEqual([]);
  });

  it('re-keys a renamed file so the tasks carry the new path', async () => {
    vault.write('Old.md', '- [ ] A task\n');
    const index = indexOver(vault);
    await index.scanVault();

    vault.rename(vault.write('New.md', '- [ ] A task\n'), 'Old.md');
    await Promise.resolve();
    await Promise.resolve();

    expect(paths(index)).toEqual(['New.md']);
  });

  it('forgets a whole subtree when a folder is renamed', async () => {
    vault.write('Projects/One.md', '- [ ] First\n');
    vault.write('Projects/Deep/Two.md', '- [ ] Second\n');
    vault.write('Elsewhere.md', '- [ ] Untouched\n');
    const index = indexOver(vault);
    await index.scanVault();

    // The folder path is never a key in the index, so a naive delete misses the
    // whole subtree and leaves it indexed under paths that no longer exist.
    vault.renameFolder('Projects', 'Settings', new TFolder('Settings'));

    expect(paths(index)).toEqual(['Elsewhere.md']);
  });
});

describe('failure and concurrency', () => {
  it('finishes the scan when one file cannot be read, and says so', async () => {
    vault.write('Good.md', '- [ ] Readable\n');
    vault.write('Bad.md', '- [ ] Unreadable\n');
    vault.failingReads.add('Bad.md');
    const index = indexOver(vault);

    await index.scanVault();

    expect(descriptions(index)).toEqual(['Readable']);
    expect(index.isFullyIndexed).toBe(false);
    expect(notices.join(' ')).toContain('1 file');
  });

  it('does not let a read failure on a rename lose the file silently', async () => {
    vault.write('Old.md', '- [ ] A task\n');
    const index = indexOver(vault);
    await index.scanVault();

    vault.write('New.md', '- [ ] A task\n');
    vault.failingReads.add('New.md');
    let emitted = false;
    index.onChange(() => (emitted = true));
    vault.rename({ path: 'New.md' } as never, 'Old.md');
    await Promise.resolve();
    await Promise.resolve();

    // The old key is already gone, so the listener must still hear about it.
    expect(emitted).toBe(true);
  });

  it('shares one scan between concurrent callers rather than clearing each other', async () => {
    vault.write('Notes.md', '- [ ] A task\n');
    const index = indexOver(vault);

    await Promise.all([index.scanVault(), index.scanVault(), index.scanVault()]);

    expect(descriptions(index)).toEqual(['A task']);
  });

  it('keeps an edit that lands mid-scan, rather than overwriting it with stale text', async () => {
    vault.write('Notes.md', '- [ ] Stale\n');
    const index = indexOver(vault);

    const release = vault.hold('Notes.md');
    const scan = index.scanVault();
    // The scan has taken its cache snapshot and is waiting on the read.
    vault.changed('Notes.md', '- [ ] Fresh\n');
    release();
    await scan;

    expect(descriptions(index)).toEqual(['Fresh']);
  });
});
