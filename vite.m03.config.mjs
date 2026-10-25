import { defineConfig } from 'vite';
export default defineConfig({ root: process.env.M03_CHECKPOINT === 'M03-A' ? 'm02-web' : 'm03-web', build: { outDir: '../dist-m03', emptyOutDir: true } });
