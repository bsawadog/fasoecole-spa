import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les composants Angular/jsdom consomment beaucoup de mémoire au démarrage.
    maxWorkers: 2,
    testTimeout: 10_000,
  },
});
