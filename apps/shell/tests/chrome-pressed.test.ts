import { describe, expect, it, vi } from 'vitest'
import { relayChromePressed } from '../src/main/chrome-pressed'
import { TABS_CHANNELS } from '../src/shared/tabs-api'

function target(id: number, destroyed = false) {
  return { id, isDestroyed: () => destroyed, send: vi.fn() }
}

describe('chrome press relay', () => {
  it('dismisses sibling editor popovers without echoing back to the shell dropdown', () => {
    const shell = target(1)
    const docs = target(2)
    const sheets = target(3)
    relayChromePressed([shell, docs, sheets], shell.id)
    expect(shell.send).not.toHaveBeenCalled()
    expect(docs.send).toHaveBeenCalledWith(TABS_CHANNELS.chromePressed)
    expect(sheets.send).toHaveBeenCalledWith(TABS_CHANNELS.chromePressed)
  })

  it('notifies every live view for native window movement', () => {
    const shell = target(1)
    const editor = target(2)
    const closed = target(3, true)
    relayChromePressed([shell, editor, closed])
    expect(shell.send).toHaveBeenCalledWith(TABS_CHANNELS.chromePressed)
    expect(editor.send).toHaveBeenCalledWith(TABS_CHANNELS.chromePressed)
    expect(closed.send).not.toHaveBeenCalled()
  })
})
