import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { componentTagger } from 'lovable-tagger';

// https://vitejs.dev/config/
// GitHub Pages serves project sites from `/<repo>/`. The Pages workflow sets GITHUB_PAGES=true;
// local development and the sandbox preview keep serving from the root.
const base = process.env.GITHUB_PAGES === 'true' ? '/music-player/' : '/';

// Meta tags such as og:image need an absolute URL, which must also follow the base path.
const htmlBasePlugin = {
  name: 'html-base-paths',
  transformIndexHtml(html: string) {
    return html.replace(/content="\/og-image\.jpg"/g, `content="${base}og-image.jpg"`);
  },
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base,
  server: {
    // 0.0.0.0 so the dev server is reachable from outside the container.
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: true,
  },
  plugins: [
    react(),
    htmlBasePlugin,
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Split the rarely-changing vendor code into its own chunks so the app code
    // can be re-released without invalidating the whole cache.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('@dnd-kit')) return 'dnd';
          if (id.includes('@radix-ui') || id.includes('@floating-ui') || id.includes('react-remove-scroll')) {
            return 'radix';
          }
          if (
            id.includes('/react-dom/') ||
            id.includes('/react/') ||
            id.includes('/scheduler/') ||
            id.includes('react-router') ||
            id.includes('@remix-run/router')
          ) {
            return 'react';
          }
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('tailwind-merge') || id.includes('clsx') || id.includes('class-variance-authority')) {
            return 'utils';
          }

          return 'vendor';
        },
      },
    },
  },
}));
