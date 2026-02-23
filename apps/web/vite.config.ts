import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/bundle-stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      // @tiptap/extension-collaboration@3.20 uses @tiptap/y-tiptap (a fork of y-prosemirror).
      // @tiptap/extension-collaboration-cursor@3.0 uses y-prosemirror directly.
      // They create different ySyncPluginKey instances, so the cursor plugin can't find
      // the sync plugin's state. Aliasing ensures both use the same plugin key.
      'y-prosemirror': '@tiptap/y-tiptap',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react-router'))
              return 'vendor-react';
            if (id.includes('@tiptap') || id.includes('prosemirror'))
              return 'vendor-tiptap';
            if (id.includes('katex'))
              return 'vendor-katex';
            if (id.includes('lowlight') || id.includes('highlight.js'))
              return 'vendor-hljs';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/webhooks': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/collab': {
        target: 'ws://localhost:3002',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
