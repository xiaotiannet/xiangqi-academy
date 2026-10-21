import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5288, host: '127.0.0.1' },
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
