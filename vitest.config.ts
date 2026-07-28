import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Everything under src/model/ is pure and has no Obsidian imports, so the
    // tests need nothing but Node. See DESIGN.md section 5.2.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
