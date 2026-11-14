/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // relative paths so Capacitor can load from the bundle
  build: { target: 'es2020', outDir: 'dist' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
