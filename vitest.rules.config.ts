import { defineConfig } from 'vitest/config'

// Security rules tests. Run through `npm run test:rules`, which starts the
// Firestore emulator and sets FIRESTORE_EMULATOR_HOST for us.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
