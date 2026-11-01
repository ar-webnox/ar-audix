import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base: the app (and its service worker) works from any folder or sub-path.
  base: './',
  plugins: [react()],
  build: { target: 'es2022' },
});
