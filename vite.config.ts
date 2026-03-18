import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@uswds/uswds/dist/fonts',
          dest: 'uswds'
        },
        {
          src: 'node_modules/@uswds/uswds/dist/img',
          dest: 'uswds'
        }
      ]
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        loadPaths: [
          path.resolve(__dirname, 'node_modules/@uswds/uswds/packages'),
          path.resolve(__dirname, 'node_modules'),
        ],
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
