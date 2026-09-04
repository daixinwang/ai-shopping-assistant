import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'react-native': resolve(process.cwd(), 'test/react-native.ts'),
    },
  },
});
