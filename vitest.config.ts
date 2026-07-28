import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // The obsidian package is types only: its `main` is the empty string,
      // because the implementation is the running app. Without this alias nothing
      // under src/data/ can be imported by a test at all.
      obsidian: fileURLToPath(new URL('./tests/obsidian-stub.ts', import.meta.url)),
    },
  },
});
