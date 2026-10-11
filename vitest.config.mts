import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Évite les arrêts SIGTERM des processus enfants en mode watch sous Windows.
    pool: 'threads',
    // Les composants Angular/jsdom consomment beaucoup de mémoire au démarrage.
    maxWorkers: 2,
    testTimeout: 10_000,
  },
});
