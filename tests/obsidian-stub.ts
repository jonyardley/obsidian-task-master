/**
 * Stand-in for the `obsidian` module, which ships types only: its `main` is the
 * empty string, because the real implementation is the running app. Aliased in
 * `vitest.config.ts` so anything under `src/data/` can be imported by a test.
 *
 * Only what `src/data/` actually touches is here. Keep it that way: the more this
 * grows, the more the tests risk proving the stub rather than the code.
 */

export interface EventRef {
  detach(): void;
}

export class Component {
  private readonly children: Component[] = [];
  private readonly cleanups: Array<() => void> = [];
  private isLoaded = false;

  load(): void {
    if (this.isLoaded) return;
    this.isLoaded = true;
    this.onload();
    for (const child of this.children) child.load();
  }

  unload(): void {
    if (!this.isLoaded) return;
    this.isLoaded = false;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    for (const child of this.children) child.unload();
    this.onunload();
  }

  onload(): void {}
  onunload(): void {}

  addChild<T extends Component>(child: T): T {
    this.children.push(child);
    if (this.isLoaded) child.load();
    return child;
  }

  register(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  registerEvent(ref: EventRef): void {
    this.cleanups.push(() => ref.detach());
  }
}

/** Every `Notice` raised, so a test can assert the user was told. */
export const notices: string[] = [];

export class Notice {
  constructor(public readonly message: string) {
    notices.push(message);
  }
}

export class TAbstractFile {
  constructor(public path: string) {}
}

export class TFile extends TAbstractFile {}
export class TFolder extends TAbstractFile {}
