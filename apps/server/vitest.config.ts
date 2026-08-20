import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // De realtime-test start een echte server en praat er via WebSocket mee;
    // dat mag niet parallel met andere bestanden op dezelfde poort gebeuren.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
