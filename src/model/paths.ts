/**
 * Vault path exclusion for the initial scan. See DESIGN.md section 5.3 step 1.
 *
 * Nothing in src/model/ may import from Obsidian. See DESIGN.md section 5.2.
 */

/**
 * True when `path` sits at or under one of `excludedPaths`.
 *
 * Entries are vault-relative and match at a folder boundary, so `Settings` drops
 * `Settings/note.md` but keeps `Settings-old/note.md` and `Templates.md`. A
 * trailing slash is tolerated because the setting is free text; a blank entry is
 * ignored rather than excluding the whole vault.
 */
export function isExcludedPath(path: string, excludedPaths: readonly string[]): boolean {
  return excludedPaths.some((entry) => {
    const prefix = entry.trim().replace(/\/+$/, '');
    if (prefix === '') return false;
    return path === prefix || path.startsWith(`${prefix}/`);
  });
}
