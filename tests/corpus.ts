import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CORPUS_PATH = fileURLToPath(new URL('./fixtures/vault-corpus.txt', import.meta.url));

/**
 * Every distinct task line from the live vault, captured 2026-07-28.
 *
 * This is the fixture behind the round-trip guarantee in DESIGN.md section 4.3.
 * Lines are returned verbatim, without the trailing newline, and must never be
 * trimmed: leading indentation is part of the line and part of what has to
 * survive a parse and serialise.
 */
export function corpusLines(): string[] {
  const text = readFileSync(CORPUS_PATH, 'utf8');
  return text.split('\n').filter((line) => line.length > 0);
}

export const EXPECTED_CORPUS_SIZE = 105;
