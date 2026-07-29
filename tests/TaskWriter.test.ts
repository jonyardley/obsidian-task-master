import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskWriter } from '../src/data/TaskWriter';
import { setPriority, setStatus } from '../src/model/mutate';
import { parseTaskLine } from '../src/model/parse';
import type { Task } from '../src/model/types';
import { FakeVault, cacheFor } from './fakeVault';
import { notices } from './obsidian-stub';

/**
 * The write path in DESIGN.md section 5.4. What matters here is not that a write
 * happens but that nothing else does: exactly one line changes, a stale read is
 * refused rather than clobbered, and a refused write leaves the file byte-identical.
 */

const FILE = 'Daily/2026-07-29.md';
const TEXT = [
  '# Tuesday',
  '',
  '## Focus',
  '',
  '- [ ] Share the role-reflection doc with Bea #crew #focus 📅 2026-07-08',
  '- [ ] Chase Marek about edge caching #atlas/docs 🔼',
  '',
].join('\n');

/** The task at `line`, as the index would have it. */
function indexed(vault: FakeVault, path: string, line: number): Task {
  const text = vault.text(path);
  const item = cacheFor(text).listItems?.find((entry) => entry.position.start.line === line);
  // The '\r' strip mirrors `TaskIndex`, which is where a task's `raw` comes from.
  const raw = text.split('\n')[line]?.replace(/\r$/, '');
  if (raw === undefined) throw new Error(`no line ${line} in ${path}`);
  const task = parseTaskLine(raw, {
    file: path,
    line,
    parentLine: item?.parent ?? -1,
    ...(item?.id === undefined ? {} : { blockId: item.id }),
  });
  if (!task) throw new Error(`line ${line} of ${path} is not a task`);
  return task;
}

describe('TaskWriter', () => {
  let vault: FakeVault;
  let refreshed: string[];
  let writer: TaskWriter;

  beforeEach(() => {
    notices.length = 0;
    vault = new FakeVault();
    vault.write(FILE, TEXT);
    refreshed = [];
    writer = new TaskWriter(vault.app, (path) => refreshed.push(path));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const read = (path = FILE): string => vault.text(path);

  it('changes exactly one line', async () => {
    const task = indexed(vault, FILE, 5);
    const outcome = await writer.apply(task, (t) => setPriority(t, 0));

    expect(outcome.status).toBe('written');
    expect(read()).toBe(
      TEXT.replace(
        '- [ ] Chase Marek about edge caching #atlas/docs 🔼',
        '- [ ] Chase Marek about edge caching #atlas/docs 🔺',
      ),
    );
  });

  it('leaves every other byte of the file alone, including the trailing newline', async () => {
    const before = read();
    await writer.apply(indexed(vault, FILE, 4), (t) => setStatus(t, 'done', '2026-07-29'));
    const after = read();

    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    expect(afterLines).toHaveLength(beforeLines.length);
    expect(afterLines.filter((line, i) => line !== beforeLines[i])).toEqual([
      '- [x] Share the role-reflection doc with Bea #crew #focus 📅 2026-07-08 ✅ 2026-07-29',
    ]);
  });

  it('logs the before and after text of the line it changes', async () => {
    // PLAN.md rule 3: with no git baseline in the vault, the log is the only record
    // of what a write did.
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await writer.apply(indexed(vault, FILE, 5), (t) => setPriority(t, 0));

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('#atlas/docs 🔼');
    expect(logged).toContain('#atlas/docs 🔺');
  });

  it('refuses a mutation the model declined, leaving the file byte-identical', async () => {
    const before = read();
    const outcome = await writer.apply(indexed(vault, FILE, 5), () => null);

    expect(outcome.status).toBe('refused');
    expect(read()).toBe(before);
  });

  it('refuses a task that does not round-trip without consulting the mutation', async () => {
    const task = { ...indexed(vault, FILE, 5), roundTrips: false };
    const mutate = vi.fn(() => null);
    const outcome = await writer.apply(task, mutate);

    expect(outcome.status).toBe('refused');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('writes nothing when the mutation changes nothing', async () => {
    const before = read();
    const outcome = await writer.apply(indexed(vault, FILE, 5), (t) => setPriority(t, 2));

    expect(outcome.status).toBe('unchanged');
    expect(read()).toBe(before);
  });

  it('aborts when the line has changed on disk since it was indexed', async () => {
    const task = indexed(vault, FILE, 5);
    const edited = TEXT.replace('Chase Marek about edge caching', 'Chase Marek about DNS');
    vault.write(FILE, edited);

    const outcome = await writer.apply(task, (t) => setPriority(t, 0));

    expect(outcome.status).toBe('stale');
    expect(read()).toBe(edited);
    expect(notices).toEqual(['Task changed on disk, view refreshed']);
    expect(refreshed).toEqual([FILE]);
  });

  it('aborts when the line changes between the verifying read and the write', async () => {
    // The window DESIGN.md section 5.4's amendment is about. Sync, another plugin or
    // Jon's own typing can land here, and only the check inside `process` can see it.
    const task = indexed(vault, FILE, 5);
    const edited = TEXT.replace('Chase Marek about edge caching', 'Chase Marek about DNS');
    vault.beforeProcess = () => {
      vault.beforeProcess = null;
      vault.write(FILE, edited);
    };

    const outcome = await writer.apply(task, (t) => setPriority(t, 0));

    expect(outcome.status).toBe('stale');
    expect(read()).toBe(edited);
    expect(notices).toEqual(['Task changed on disk, view refreshed']);
    expect(refreshed).toEqual([FILE]);
  });

  it('aborts when the task line has been deleted outright', async () => {
    const task = indexed(vault, FILE, 5);
    vault.write(FILE, '# Tuesday\n');

    const outcome = await writer.apply(task, (t) => setPriority(t, 0));

    expect(outcome.status).toBe('stale');
    expect(read()).toBe('# Tuesday\n');
  });

  it('reports a missing file rather than throwing', async () => {
    const task = indexed(vault, FILE, 5);
    vault.delete(FILE);

    await expect(writer.apply(task, (t) => setPriority(t, 0))).resolves.toEqual({
      status: 'missing',
    });
  });

  it('follows a block ID to its new line when the file has shifted', async () => {
    vault.write(FILE, `${TEXT}- [ ] Tidy the seed data #atlas ^b0q4i3\n`);
    const task = indexed(vault, FILE, 6);
    expect(task.blockId).toBe('b0q4i3');

    // Two lines inserted above it: the recorded line number is now wrong, and only
    // the block ID can find the task again.
    vault.write(FILE, `- [ ] Something new\n- [ ] Something else\n${TEXT}- [ ] Tidy the seed data #atlas ^b0q4i3\n`);

    const outcome = await writer.apply(task, (t) => setPriority(t, 0));

    expect(outcome.status).toBe('written');
    expect(read()).toContain('- [ ] Tidy the seed data 🔺 #atlas ^b0q4i3');
    expect(read()).toContain('- [ ] Something new');
  });

  it('serialises two writes to the same file rather than interleaving them', async () => {
    const first = indexed(vault, FILE, 4);
    const second = indexed(vault, FILE, 5);

    const outcomes = await Promise.all([
      writer.apply(first, (t) => setStatus(t, 'done', '2026-07-29')),
      writer.apply(second, (t) => setPriority(t, 0)),
    ]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual(['written', 'written']);
    const after = read();
    expect(after).toContain('- [x] Share the role-reflection doc with Bea #crew #focus 📅 2026-07-08 ✅ 2026-07-29');
    expect(after).toContain('- [ ] Chase Marek about edge caching #atlas/docs 🔺');
  });
});

describe('TaskWriter on a CRLF file', () => {
  const CRLF = '# Tuesday\r\n\r\n- [ ] Chase Marek about edge caching #atlas/docs\r\n';

  it('changes one line and leaves every line ending as it found it', async () => {
    const vault = new FakeVault();
    vault.write(FILE, CRLF);
    const writer = new TaskWriter(vault.app, () => undefined);

    const outcome = await writer.apply(indexed(vault, FILE, 2), (t) =>
      setStatus(t, 'done', '2026-07-29'),
    );

    expect(outcome.status).toBe('written');
    expect(vault.text(FILE)).toBe(
      '# Tuesday\r\n\r\n- [x] Chase Marek about edge caching ✅ 2026-07-29 #atlas/docs\r\n',
    );
  });
});
