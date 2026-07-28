import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CORPUS_PATH = fileURLToPath(new URL('./fixtures/vault-corpus.txt', import.meta.url));

/**
 * The corpus fixture: one line per distinct task shape the grammar has to handle.
 *
 * This is the fixture behind the round-trip guarantee in DESIGN.md section 4.3.
 * Lines are returned verbatim, without the trailing newline, and must never be
 * trimmed: leading indentation is part of the line and part of what has to
 * survive a parse and serialise.
 *
 * The content is invented. It was transliterated line for line from a capture of
 * the live vault on 2026-07-28, preserving token structure, indentation, glyphs,
 * link shapes and composition counts exactly, because the vault holds client and
 * personal detail that must not sit in a public repository. `fixtures.test.ts`
 * asserts the grammar coverage that swap had to keep.
 */
export function corpusLines(): string[] {
  const text = readFileSync(CORPUS_PATH, 'utf8');
  return text.split('\n').filter((line) => line.length > 0);
}

export const EXPECTED_CORPUS_SIZE = 105;
