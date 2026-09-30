import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const shell = fileURLToPath(new URL('..', import.meta.url))

function sourceText(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return sourceText(path)
      return /\.(?:ts|tsx|css)$/.test(entry.name) ? readFileSync(path, 'utf8') : ''
    })
    .join('\n')
}

describe('no unsolicited GitHub star invitation', () => {
  it('has no card, scheduler, eligibility tracking, startup hook, or prompt IPC', () => {
    const source = sourceText(join(shell, 'src'))
    expect(source).not.toMatch(
      /StarPromptCard|starPromptShouldShow|starPromptAction|recordStarPromptDocOpen|GENOFFICE_FORCE_STAR_PROMPT|Enjoying NiuOffice|Star NiuOffice|star-prompt/,
    )
    for (const file of [
      'src/main/star-prompt.ts',
      'src/renderer/src/StarPromptCard.tsx',
      'src/renderer/src/star-prompt.css',
    ]) {
      expect(existsSync(join(shell, file))).toBe(false)
    }
  })

  it('keeps the ordinary user-requested repository link', () => {
    const source = readFileSync(join(shell, 'src/main/index.ts'), 'utf8')
    expect(source).toContain('ipcMain.handle(HOME_CHANNELS.openGitHubRepo')
    expect(source).toContain('shell.openExternal(PRODUCT_REPOSITORY_URL)')
  })
})
