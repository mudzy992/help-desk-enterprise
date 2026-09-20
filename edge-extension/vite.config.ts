import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * EP-HelpDesk Edge companion — MV3 bundle.
 *
 * - `background.ts` builds to a plain ES module service worker (background.js).
 * - `popup.html` is the action popup entry; assets keep stable names so the
 *   manifest can reference them without hashes.
 */
export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2022',
    rollupOptions: {
      input: {
        background: fileURLToPath(new URL('./src/background.ts', import.meta.url)),
        popup: fileURLToPath(new URL('./popup.html', import.meta.url)),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
