import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Detached windows retain local open-file deduplication and folder-rename tracking. */

const instances: FakeWindow[] = []

class FakeWindow {
  destroyed = false
  title: string
  handlers = new Map<string, (...args: never[]) => void>()
  contentView = { addChildView: vi.fn(), removeChildView: vi.fn() }

  constructor(opts: { title?: string }) {
    this.title = opts.title ?? ''
    instances.push(this)
  }

  on = (event: string, fn: (...args: never[]) => void): void => {
    this.handlers.set(event, fn)
  }

  isDestroyed = (): boolean => this.destroyed
  isMinimized = (): boolean => false
  restore = vi.fn()
  show = vi.fn()
  focus = vi.fn()
  getContentBounds = (): { width: number; height: number } => ({ width: 100, height: 100 })
  setTitle = (title: string): void => {
    this.title = title
  }

  getTitle = (): string => {
    if (this.destroyed) throw new Error('window destroyed')
    return this.title
  }

  isFocused = (): boolean => false
  destroy = (): void => {
    this.destroyed = true
  }
}

vi.mock('electron', () => ({
  BrowserWindow: FakeWindow,
}))

vi.mock('../../docs/src/main/docs-main', () => ({
  docsQueryDirty: vi.fn(() => Promise.resolve(false)),
  requestDocsClose: vi.fn(),
  setActiveDocsResolver: vi.fn(),
  teardownDocsRenderer: vi.fn(),
}))

vi.mock('../../sheets/src/main/sheets-main', () => ({
  requestSheetsClose: vi.fn(),
  setActiveSheetsWebContents: vi.fn(),
  sheetsPendingEditCount: vi.fn(() => 0),
}))

vi.mock('../src/main/tab-manager', () => ({
  canonicalPath: (p: string) => p.toLowerCase(),
}))

type DetachedModule = typeof import('../src/main/detached-windows')

let detached: DetachedModule

function fakeView(id: number) {
  return {
    webContents: {
      id,
      isDestroyed: () => false,
      focus: vi.fn(),
      close: vi.fn(),
    },
    setBounds: vi.fn(),
    setVisible: vi.fn(),
  }
}

beforeEach(async () => {
  vi.resetModules()
  instances.length = 0
  detached = await import('../src/main/detached-windows')
})

describe('detached editor windows', () => {
  it('tracks live file paths and focuses an existing editor instead of opening a duplicate', () => {
    detached.createDetachedEditorWindow({
      view: fakeView(22) as never,
      kind: 'sheets',
      title: 'b',
      filePath: 'C:/docs/b.txt',
      applyMenuFor: () => {},
    })
    expect(detached.detachedFilePaths()).toEqual(['C:/docs/b.txt'])
    expect(detached.focusDetachedByPath('C:/DOCS/B.TXT')).toBe(true)
    expect(instances[0].focus).toHaveBeenCalledOnce()
  })

  it('ignores destroyed windows for open-file deduplication', () => {
    detached.createDetachedEditorWindow({
      view: fakeView(31) as never,
      kind: 'docs',
      title: 'c',
      filePath: 'C:/docs/c.txt',
      applyMenuFor: () => {},
    })
    const win = instances[0]!
    win.destroyed = true
    expect(detached.detachedFilePaths()).toEqual([])
    expect(detached.focusDetachedByPath('C:/docs/c.txt')).toBe(false)
  })
})
