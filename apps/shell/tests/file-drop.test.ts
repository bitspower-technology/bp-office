// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFileDropOpen } from '@genoffice/ui'

function dragEvent(
  type: string,
  options: { files?: File[]; types?: string[]; relatedTarget?: EventTarget | null } = {},
): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  const dataTransfer = {
    files: options.files ?? [],
    types: options.types ?? ['Files'],
    dropEffect: 'none',
  }
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  Object.defineProperty(event, 'relatedTarget', { value: options.relatedTarget ?? null })
  return event
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('installFileDropOpen', () => {
  it('prevents file navigation and opens every dropped file', () => {
    const openFiles = vi.fn()
    const active: boolean[] = []
    const uninstall = installFileDropOpen(openFiles, {
      onActiveChange: (next) => active.push(next),
    })
    const files = [new File(['a'], 'a.docx'), new File(['b'], 'b.pdf')]

    const over = dragEvent('dragover', { files })
    window.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    expect(over.dataTransfer?.dropEffect).toBe('copy')

    const drop = dragEvent('drop', { files })
    window.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(openFiles).toHaveBeenCalledWith(files)
    expect(active).toEqual([true, false])
    uninstall()
  })

  it('ignores non-file drags', () => {
    const openFiles = vi.fn()
    const uninstall = installFileDropOpen(openFiles)
    const drop = dragEvent('drop', { types: ['text/plain'] })

    window.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(false)
    expect(openFiles).not.toHaveBeenCalled()
    uninstall()
  })

  it('leaves a drop claimed by an inner attachment target alone', () => {
    const openFiles = vi.fn()
    const target = document.createElement('div')
    document.body.append(target)
    target.addEventListener('drop', (event) => event.preventDefault())
    const uninstall = installFileDropOpen(openFiles)
    const drop = dragEvent('drop', { files: [new File(['a'], 'attachment.png')] })

    target.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(openFiles).not.toHaveBeenCalled()
    uninstall()
  })

  it('uninstalls all global handlers', () => {
    const openFiles = vi.fn()
    const uninstall = installFileDropOpen(openFiles)
    uninstall()
    const drop = dragEvent('drop', { files: [new File(['a'], 'a.docx')] })

    window.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(false)
    expect(openFiles).not.toHaveBeenCalled()
  })
})
