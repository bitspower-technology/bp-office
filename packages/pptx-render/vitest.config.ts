import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Always resolve to this repo's workspace sources (consistent with tsconfig paths)
  resolve: {
    alias: {
      // Subpath before the bare name: string aliases are prefix replacements
      '@genoffice/pptx-engine/table-grid': resolve(here, '../pptx-engine/src/table-grid.ts'),
      '@genoffice/pptx-engine/identity': resolve(here, '../pptx-engine/src/identity.ts'),
      '@genoffice/pptx-engine/background-promote': resolve(
        here,
        '../pptx-engine/src/background-promote.ts',
      ),
      '@genoffice/pptx-engine': resolve(here, '../pptx-engine/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // build-chart.test.ts builds three 130,000-point charts. That clears vitest's 5s default in a
    // fraction of a second on an idle machine but overruns it on a loaded CI runner, where this
    // package had no override at all. Same 20s the other compute-heavy workspaces use.
    testTimeout: 20000,
  },
})
