import { Notice } from 'obsidian';
import type { GroupDef, Settings, StoreData } from '../model/types';
import { DEFAULT_GROUPS, DEFAULT_SETTINGS } from '../settings';

/**
 * `data.json`, per DESIGN.md section 4.4.
 *
 * Order garbage collection is deliberately absent until phase 6: nothing writes a
 * rank before then, and DESIGN.md section 4.5 forbids collecting from a partial
 * index.
 */

/**
 * What the store needs from the plugin. Narrower than `Plugin` on purpose, so the
 * tests can drive it without the `obsidian` stub growing a plugin class.
 */
export interface StoreHost {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
  /** `Plugin.manifest.dir`, where `data.json` lives. */
  readonly dataDir: string | undefined;
  readonly adapter: {
    rename(from: string, to: string): Promise<void>;
    exists(path: string): Promise<boolean>;
  };
}

export class Store {
  private constructor(
    private readonly host: StoreHost,
    private state: StoreData,
  ) {}

  static async load(host: StoreHost): Promise<Store> {
    return new Store(host, await read(host));
  }

  get data(): StoreData {
    return this.state;
  }

  get settings(): Settings {
    return this.state.settings;
  }

  get groups(): readonly GroupDef[] {
    return this.state.groups;
  }

  async setGroupCollapsed(id: string, collapsed: boolean): Promise<void> {
    const group = this.state.groups.find((candidate) => candidate.id === id);
    if (!group || group.collapsed === collapsed) return;
    this.state = {
      ...this.state,
      groups: this.state.groups.map((candidate) =>
        candidate.id === id ? { ...candidate, collapsed } : candidate,
      ),
    };
    await this.save();
  }

  async setVirtualCollapsed(kind: 'unsorted' | 'done', collapsed: boolean): Promise<void> {
    if (this.state.virtualCollapsed[kind] === collapsed) return;
    this.state = {
      ...this.state,
      virtualCollapsed: { ...this.state.virtualCollapsed, [kind]: collapsed },
    };
    await this.save();
  }

  async save(): Promise<void> {
    await this.host.saveData(this.state);
  }
}

function defaults(): StoreData {
  return {
    version: 1,
    order: {},
    groups: DEFAULT_GROUPS.map((group) => ({ ...group })),
    virtualCollapsed: { unsorted: false, done: true },
    settings: { ...DEFAULT_SETTINGS },
  };
}

async function read(host: StoreHost): Promise<StoreData> {
  let raw: unknown;
  try {
    raw = await host.loadData();
  } catch (error) {
    await quarantine(host, error);
    return defaults();
  }

  if (raw === null || raw === undefined) {
    // Nothing means one of two things, and they must not be confused. Obsidian's
    // loadData reads and parses in a single try/catch, so an unparseable file is
    // indistinguishable from an absent one here. Only an absent one is a first run;
    // a file that exists and still yielded nothing is corrupt, and overwriting it
    // on the next save is exactly the silent loss of ordering DESIGN.md section 7
    // forbids.
    if (await fileExists(host)) {
      await quarantine(host, new Error('data.json exists but yielded no data'));
    }
    return defaults();
  }

  if (typeof raw !== 'object' || Array.isArray(raw) || (raw as { version?: unknown }).version !== 1) {
    await quarantine(host, new Error('unrecognised data.json shape'));
    return defaults();
  }

  return normalise(raw as Partial<StoreData>);
}

function normalise(stored: Partial<StoreData>): StoreData {
  const base = defaults();
  return {
    version: 1,
    order: numbersOnly(stored.order),
    // A missing key means never written, so it seeds. An empty list is a choice:
    // Jon can delete every group, and that must survive a reload.
    groups: stored.groups === undefined ? base.groups : usableGroups(stored.groups),
    virtualCollapsed: {
      unsorted: stored.virtualCollapsed?.unsorted ?? base.virtualCollapsed.unsorted,
      done: stored.virtualCollapsed?.done ?? base.virtualCollapsed.done,
    },
    settings: mergeSettings(stored.settings),
  };
}

function numbersOnly(order: unknown): Record<string, number> {
  if (typeof order !== 'object' || order === null) return {};
  return Object.fromEntries(
    Object.entries(order).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  );
}

/**
 * Ids have to be unique: the view keys its sections by id, and two sections
 * sharing one would collide in the keyed block and blank the whole view.
 */
function usableGroups(groups: readonly unknown[]): GroupDef[] {
  const seen = new Set<string>();
  return groups.filter(isGroupDef).filter((group) => {
    if (seen.has(group.id)) return false;
    seen.add(group.id);
    return true;
  });
}

function isGroupDef(value: unknown): value is GroupDef {
  if (typeof value !== 'object' || value === null) return false;
  const group = value as Partial<GroupDef>;
  return (
    typeof group.id === 'string' &&
    typeof group.label === 'string' &&
    typeof group.tag === 'string' &&
    typeof group.collapsed === 'boolean' &&
    typeof group.order === 'number'
  );
}

async function fileExists(host: StoreHost): Promise<boolean> {
  if (host.dataDir === undefined) return false;
  try {
    return await host.adapter.exists(`${host.dataDir}/data.json`);
  } catch {
    return false;
  }
}

/** Keys the current `Settings` does not define are dropped, not carried forward. */
function mergeSettings(stored: unknown): Settings {
  const merged = { ...DEFAULT_SETTINGS };
  if (typeof stored !== 'object' || stored === null) return merged;
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const value = (stored as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (Array.isArray(DEFAULT_SETTINGS[key])) {
      if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
        (merged as Record<string, unknown>)[key] = value;
      }
    } else if (key === 'fallbackSort') {
      // A type check is not enough here: an unrecognised string would pass it and
      // then degrade the ordering silently, since the comparator falls through to
      // file order for anything it does not recognise.
      if (value === 'priority' || value === 'due' || value === 'file') merged[key] = value;
    } else if (typeof value === typeof DEFAULT_SETTINGS[key]) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/**
 * Renames the unreadable file rather than overwriting it, per DESIGN.md section 7:
 * a corrupt `data.json` must never silently cost Jon his ordering.
 */
async function quarantine(host: StoreHost, error: unknown): Promise<void> {
  console.error('[task-master] data.json could not be read', error);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = host.dataDir;

  if (dir !== undefined) {
    try {
      await host.adapter.rename(`${dir}/data.json`, `${dir}/data.corrupt-${stamp}.json`);
    } catch (renameError) {
      console.error('[task-master] could not set the corrupt data.json aside', renameError);
    }
  }

  new Notice('Task Master: data.json could not be read. It has been set aside, see the console.');
}
