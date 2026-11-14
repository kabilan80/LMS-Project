import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@lms/shared': fileURLToPath(new URL('../../libs/shared/src/index.ts', import.meta.url)) },
  },
  server: { port: 4200 },
  test: { environment: 'jsdom', globals: true },
});
