import { describe, expect, it } from 'vitest';
import { isExcludedPath } from '../src/model/paths';

/**
 * Path exclusion, per DESIGN.md section 5.3 step 1 and the `excludedPaths`
 * setting in section 4.4. Pure, so it lives in `model/` and is tested here
 * rather than by the manual checklist.
 */
describe('isExcludedPath', () => {
  const DEFAULTS = ['Settings', 'Templates'];

  it('excludes a file directly inside an excluded folder', () => {
    expect(isExcludedPath('Settings/_Vault Guide.md', DEFAULTS)).toBe(true);
  });

  it('excludes a file nested deeper inside an excluded folder', () => {
    expect(isExcludedPath('Templates/daily/note.md', DEFAULTS)).toBe(true);
  });

  it('keeps a file whose name merely starts with an excluded folder name', () => {
    // The bug this guards: a naive startsWith would drop this file.
    expect(isExcludedPath('Settings-old/note.md', DEFAULTS)).toBe(false);
    expect(isExcludedPath('Templates.md', DEFAULTS)).toBe(false);
  });

  it('keeps a same-named folder that is not at the vault root', () => {
    // excludedPaths are vault-relative, so this is a different folder.
    expect(isExcludedPath('Projects/Settings/note.md', DEFAULTS)).toBe(false);
  });

  it('keeps everything when nothing is excluded', () => {
    expect(isExcludedPath('Settings/_Vault Guide.md', [])).toBe(false);
  });

  it('tolerates a trailing slash in the configured path', () => {
    // Users type folder names both ways, and the setting is free text.
    expect(isExcludedPath('Settings/_Vault Guide.md', ['Settings/'])).toBe(true);
  });

  it('ignores an empty or whitespace-only configured path', () => {
    // An empty entry must not exclude the whole vault.
    expect(isExcludedPath('Daily Notes/2026-07-28.md', ['', '   '])).toBe(false);
  });

  it('matches case-sensitively, as Obsidian paths are', () => {
    expect(isExcludedPath('settings/note.md', DEFAULTS)).toBe(false);
  });

  it('excludes a file that is itself the configured path', () => {
    expect(isExcludedPath('Inbox.md', ['Inbox.md'])).toBe(true);
  });
});
