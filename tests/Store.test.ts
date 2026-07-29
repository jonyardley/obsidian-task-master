import { beforeEach, describe, expect, it } from 'vitest';
import { Store, type StoreHost } from '../src/data/Store';
import { DEFAULT_GROUPS, DEFAULT_SETTINGS } from '../src/settings';
import { notices } from './obsidian-stub';

/**
 * The persisted store, per DESIGN.md section 4.4 and the `data.json` row of the
 * error table in section 7. A corrupt file must never cost Jon his ordering, so it
 * is renamed rather than overwritten.
 */
class FakeHost implements StoreHost {
  saved: unknown = undefined;
  readonly renames: Array<[string, string]> = [];
  renameFails = false;
  /** Whether data.json is on disk, independently of what loadData returns. */
  onDisk = false;
  readonly dataDir = '.obsidian/plugins/obsidian-task-master';

  constructor(private readonly stored: () => unknown) {}

  async loadData(): Promise<unknown> {
    return this.stored();
  }

  async saveData(data: unknown): Promise<void> {
    this.saved = data;
  }

  readonly adapter = {
    rename: async (from: string, to: string): Promise<void> => {
      if (this.renameFails) throw new Error('fake rename failure');
      this.renames.push([from, to]);
    },
    exists: async (): Promise<boolean> => this.onDisk,
  };
}

beforeEach(() => {
  notices.length = 0;
});

describe('Store, first run', () => {
  it('seeds the four groups from DESIGN.md section 4.4', async () => {
    const store = await Store.load(new FakeHost(() => null));
    expect(store.groups).toEqual(DEFAULT_GROUPS);
  });

  it('seeds the default settings', async () => {
    const store = await Store.load(new FakeHost(() => null));
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('opens the working queue and puts completed work away', async () => {
    const store = await Store.load(new FakeHost(() => null));
    expect(store.data.virtualCollapsed).toEqual({ unsorted: false, done: true });
  });

  it('starts with no ordering', async () => {
    const store = await Store.load(new FakeHost(() => null));
    expect(store.data.order).toEqual({});
  });

  it('writes nothing until something changes', async () => {
    const host = new FakeHost(() => null);
    await Store.load(host);
    expect(host.saved).toBeUndefined();
  });
});

describe('Store, an existing file', () => {
  const stored = {
    version: 1,
    order: { 'tm-1': 1024, 'tm-2': 2048 },
    groups: [{ id: 'g-focus', label: 'Focus', tag: 'focus', collapsed: true, order: 0 }],
    virtualCollapsed: { unsorted: true, done: false },
    settings: { ...DEFAULT_SETTINGS, fallbackSort: 'due' as const },
  };

  it('reads it back as written', async () => {
    const store = await Store.load(new FakeHost(() => structuredClone(stored)));
    expect(store.data).toEqual(stored);
  });

  it('fills in settings keys the file does not carry', async () => {
    const partial = { ...structuredClone(stored), settings: { doneSectionLimit: 10 } };
    const store = await Store.load(new FakeHost(() => partial));
    expect(store.settings).toEqual({ ...DEFAULT_SETTINGS, doneSectionLimit: 10 });
  });

  it('ignores a settings key it does not know', async () => {
    const partial = { ...structuredClone(stored), settings: { colour: 'purple' } };
    const store = await Store.load(new FakeHost(() => partial));
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('drops a group entry missing the fields a group needs', async () => {
    const broken = { ...structuredClone(stored), groups: [{ id: 'g-x' }, stored.groups[0]] };
    const store = await Store.load(new FakeHost(() => broken));
    expect(store.groups.map((group) => group.id)).toEqual(['g-focus']);
  });

  it('drops an order entry that is not a number, keeping the rest', async () => {
    const broken = { ...structuredClone(stored), order: { 'tm-1': 1024, 'tm-2': 'first' } };
    const store = await Store.load(new FakeHost(() => broken));
    expect(store.data.order).toEqual({ 'tm-1': 1024 });
  });

  it('falls back to the seeded groups when the file has none', async () => {
    // An empty group list is a legitimate choice: Jon can delete every group. It
    // is a missing key that means "never written", and that seeds.
    const noKey = { ...structuredClone(stored), groups: undefined };
    expect((await Store.load(new FakeHost(() => noKey))).groups).toEqual(DEFAULT_GROUPS);
    const emptyList = { ...structuredClone(stored), groups: [] };
    expect((await Store.load(new FakeHost(() => emptyList))).groups).toEqual([]);
  });
});

describe('Store, a corrupt file', () => {
  const corrupt = (stored: () => unknown): FakeHost => new FakeHost(stored);

  it('renames the file rather than overwriting it', async () => {
    const host = corrupt(() => {
      throw new SyntaxError('Unexpected token } in JSON');
    });
    await Store.load(host);
    expect(host.renames).toHaveLength(1);
    const [from, to] = host.renames[0]!;
    expect(from).toBe('.obsidian/plugins/obsidian-task-master/data.json');
    expect(to).toMatch(
      /^\.obsidian\/plugins\/obsidian-task-master\/data\.corrupt-[\dT-]+Z?\.json$/,
    );
  });

  it('starts from defaults and tells the user', async () => {
    const store = await Store.load(
      corrupt(() => {
        throw new SyntaxError('Unexpected token } in JSON');
      }),
    );
    expect(store.groups).toEqual(DEFAULT_GROUPS);
    expect(notices.join(' ')).toMatch(/could not be read/i);
  });

  it('treats a file that is not an object as corrupt', async () => {
    const host = corrupt(() => 'not a store');
    const store = await Store.load(host);
    expect(host.renames).toHaveLength(1);
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('treats an unknown version as corrupt rather than reading it hopefully', async () => {
    const host = corrupt(() => ({ version: 2, order: { 'tm-1': 1024 } }));
    await Store.load(host);
    expect(host.renames).toHaveLength(1);
  });

  it('still starts from defaults when the file cannot even be renamed', async () => {
    const host = corrupt(() => {
      throw new SyntaxError('Unexpected token } in JSON');
    });
    host.renameFails = true;
    const store = await Store.load(host);
    expect(store.groups).toEqual(DEFAULT_GROUPS);
    expect(host.saved).toBeUndefined();
  });

  it('does not treat an absent file as corrupt', async () => {
    const host = corrupt(() => null);
    await Store.load(host);
    expect(host.renames).toEqual([]);
    expect(notices).toEqual([]);
  });

  it('treats nothing from a file that is on disk as corrupt', async () => {
    // Obsidian's loadData reads and parses inside one try/catch, so an unparseable
    // file arrives here as null, indistinguishable from an absent one. Taking it for
    // a first run would let the next save overwrite Jon's ordering.
    const host = corrupt(() => null);
    host.onDisk = true;
    const store = await Store.load(host);
    expect(host.renames).toHaveLength(1);
    expect(store.groups).toEqual(DEFAULT_GROUPS);
    expect(notices.join(' ')).toMatch(/could not be read/i);
  });

  it('drops a duplicate group id rather than letting two sections share one', async () => {
    const host = new FakeHost(() => ({
      version: 1,
      groups: [
        { id: 'g-focus', label: 'Focus', tag: 'focus', collapsed: false, order: 0 },
        { id: 'g-focus', label: 'Focus again', tag: 'later', collapsed: true, order: 1 },
      ],
    }));
    const store = await Store.load(host);
    expect(store.groups.map((group) => group.label)).toEqual(['Focus']);
  });

  it('rejects a fallbackSort it does not recognise', async () => {
    // A type check alone would pass it, and the comparator would then quietly fall
    // through to file order.
    const host = new FakeHost(() => ({ version: 1, settings: { fallbackSort: 'bogus' } }));
    expect((await Store.load(host)).settings.fallbackSort).toBe(DEFAULT_SETTINGS.fallbackSort);
  });
});

describe('Store, changing state', () => {
  it('persists a group collapse', async () => {
    const host = new FakeHost(() => null);
    const store = await Store.load(host);
    await store.setGroupCollapsed('g-today', true);
    expect(store.groups.find((group) => group.id === 'g-today')?.collapsed).toBe(true);
    expect(host.saved).toMatchObject({
      groups: expect.arrayContaining([expect.objectContaining({ id: 'g-today', collapsed: true })]),
    });
  });

  it('ignores a collapse for a group that is not there', async () => {
    const host = new FakeHost(() => null);
    const store = await Store.load(host);
    await store.setGroupCollapsed('g-nope', true);
    expect(host.saved).toBeUndefined();
  });

  it('persists a virtual group collapse', async () => {
    const host = new FakeHost(() => null);
    const store = await Store.load(host);
    await store.setVirtualCollapsed('done', false);
    expect(store.data.virtualCollapsed).toEqual({ unsorted: false, done: false });
    expect(host.saved).toMatchObject({ virtualCollapsed: { unsorted: false, done: false } });
  });

  it('does not write when the state is already what was asked for', async () => {
    const host = new FakeHost(() => null);
    const store = await Store.load(host);
    await store.setVirtualCollapsed('done', true);
    expect(host.saved).toBeUndefined();
  });

  it('saves a plain object, not a class instance', async () => {
    const host = new FakeHost(() => null);
    const store = await Store.load(host);
    await store.setVirtualCollapsed('done', false);
    expect(JSON.parse(JSON.stringify(host.saved))).toEqual(store.data);
  });
});
