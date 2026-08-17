import { describe, expect, it } from 'vitest'

import { QueuedWorkbookPaths } from '../src/main/queued-workbooks'

describe('QueuedWorkbookPaths', () => {
  it('keeps simultaneous shell-opened workbooks isolated by WebContents id', () => {
    const queued = new QueuedWorkbookPaths()
    queued.set(101, 'C:\\files\\first.xlsx')
    queued.set(202, 'C:\\files\\second.xlsx')

    expect(queued.has(101)).toBe(true)
    expect(queued.has(202)).toBe(true)
    expect(queued.take(101)).toBe('C:\\files\\first.xlsx')
    expect(queued.has(101)).toBe(false)
    expect(queued.has(202)).toBe(true)
    expect(queued.take(202)).toBe('C:\\files\\second.xlsx')
    expect(queued.has()).toBe(false)
  })

  it('cleans up a queued path when its tab is destroyed', () => {
    const queued = new QueuedWorkbookPaths()
    queued.set(101, '/files/first.xlsx')
    queued.delete(101)
    expect(queued.take(101)).toBeUndefined()
  })
})
