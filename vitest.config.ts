import { defineConfig } from 'vitest/config'

/// Root aggregation only: each workspace keeps its own environment and
/// resolves fixtures relative to its own directory. `npm test` still runs
/// per-workspace scripts (including the Rust sidecar build).
export default defineConfig({
  test: {
    projects: [
      'apps/docs/vitest.config.ts',
      'apps/sheets/vitest.config.ts',
      'apps/pdf/vitest.config.ts',
      'apps/markdown/vitest.config.ts',
      'apps/shell/vitest.config.ts',
      'packages/*/vitest.config.ts',
    ],
  },
})
