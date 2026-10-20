import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // relative asset paths: works on GitHub Pages sub-paths and any static host
  build: {
    rollupOptions: {
      input: ['index.html', 'api-demo.html'],
    },
  },
  server: { port: 5173, open: true },
});
