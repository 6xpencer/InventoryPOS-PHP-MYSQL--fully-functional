import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost/InventoryPOS/backend',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api.php'),
      },
    },
  },
});
