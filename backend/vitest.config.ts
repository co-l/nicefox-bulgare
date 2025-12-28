import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      'nicefox-graphdb/packages/client/src/index.ts': 'nicefox-graphdb/packages/client/src/index.ts',
      'nicefox-graphdb/packages/server/src/index.js': 'nicefox-graphdb/packages/server/src/index.ts',
    },
  },
})
