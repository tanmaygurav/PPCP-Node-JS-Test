import { defineConfig } from 'vite';
export default defineConfig({ root: 'm02-web', build: { outDir: '../dist-m02', emptyOutDir: true }, server: {
  host: 'localhost', port: 5173, strictPort: true, proxy: { '/api': 'http://localhost:3002' }
} });
