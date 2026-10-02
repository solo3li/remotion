import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/adapters/**',
        'src/types/**',
        'src/hooks/useApiKeys.ts',
        'src/components/CredentialsModal.tsx',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/__tests__/**'],
    },
  },
});
