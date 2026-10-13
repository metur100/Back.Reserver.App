/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.BACKRESERVE_API_URL ?? 'http://localhost:5280';

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; locally and on a custom domain it is "/".
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/media': { target: apiTarget, changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/media': { target: apiTarget, changeOrigin: false },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Path based so sub-entries like react-dom/client land in the vendor chunk too (long-term cacheable).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react';
          if (id.includes('@tanstack')) return 'query';
          if (/node_modules[\\/](react-hook-form|zod|@hookform)[\\/]/.test(id)) return 'forms';
          if (/node_modules[\\/](@radix-ui|@floating-ui|sonner|tailwind-merge|clsx|class-variance-authority)[\\/]/.test(id)) return 'ui';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
