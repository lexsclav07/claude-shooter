import { defineConfig } from 'vite';

// Inlines the bundled JS and CSS into dist/index.html so the built game is a
// single self-contained file you can double-click (no web server needed).
function inlineBundle() {
  return {
    name: 'inline-bundle',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlFile = Object.values(bundle).find((f) => f.fileName.endsWith('.html'));
      if (!htmlFile) return;
      let html = htmlFile.source;
      for (const [name, file] of Object.entries(bundle)) {
        const base = name.split('/').pop().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (file.type === 'chunk' && name.endsWith('.js')) {
          const tag = new RegExp(`<script[^>]*src="[^"]*${base}"[^>]*></script>`);
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          html = html.replace(tag, () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${base}"[^>]*>`);
          html = html.replace(tag, () => `<style>${file.source}</style>`);
          delete bundle[name];
        }
      }
      htmlFile.source = html;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [inlineBundle()],
  build: {
    target: 'es2022',
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  server: { open: true },
});
