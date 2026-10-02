import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/ai-employees/',
  server: {
    port: 3005,
    host: true,
  },
});
