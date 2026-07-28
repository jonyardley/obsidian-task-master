import { sveltePreprocess } from 'svelte-preprocess';

// Consumed by svelte-check and the editor language server only.
// The build configures the compiler itself in esbuild.config.mjs.
export default {
  preprocess: sveltePreprocess(),
};
