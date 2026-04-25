import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/marketing/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    css: false,
  },
});
