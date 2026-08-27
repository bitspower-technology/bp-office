import { describe, expect, it, vi } from 'vitest'

import { MAX_DROPPED_FILES } from '../src/shared/home-api'
import {
  isTrustedDropSender,
  pathsReferToSameFile,
  routeDroppedPaths,
  validateDroppedPaths,
} from '../src/main/dropped-files'

describe('pathsReferToSameFile', () => {
  it('normalizes and compares Windows paths case-insensitively', () => {
    expect(pathsReferToSameFile('C:\\Docs\\A.docx', 'c:\\docs\\folder\\..\\a.DOCX', 'win32')).toBe(
      true,
    )
  })

  it('keeps POSIX path comparison case-sensitive', () => {
    expect(pathsReferToSameFile('/docs/A.docx', '/docs/A.docx', 'linux')).toBe(true)
    expect(pathsReferToSameFile('/docs/A.docx', '/docs/a.docx', 'linux')).toBe(false)
  })
})

describe('validateDroppedPaths', () => {
  it('rejects non-arrays without touching the filesystem', () => {
    const isRegularFile = vi.fn(() => true)
    expect(validateDroppedPaths('C:\\docs\\a.docx', { platform: 'win32', isRegularFile })).toEqual({
      paths: [],
      duplicates: 0,
      rejected: 1,
    })
    expect(isRegularFile).not.toHaveBeenCalled()
  })

  it('keeps supported existing regular files in input order and rejects unsafe entries', () => {
    const existing = new Set([
      'C:\\docs\\a.docx',
      'C:\\docs\\b.xlsx',
      'C:\\docs\\macro.xlsm',
      'C:\\docs\\c.MD',
    ])
    const result = validateDroppedPaths(
      [
        'C:\\docs\\a.docx',
        'relative.pdf',
        'C:\\docs\\ignored.pptx',
        42,
        'C:\\docs\\missing.pdf',
        'C:\\docs\\b.xlsx',
        'C:\\docs\\macro.xlsm',
        'C:\\docs\\c.MD',
      ],
      { platform: 'win32', isRegularFile: (path) => existing.has(path) },
    )
    expect(result).toEqual({
      paths: ['C:\\docs\\a.docx', 'C:\\docs\\b.xlsx', 'C:\\docs\\macro.xlsm', 'C:\\docs\\c.MD'],
      duplicates: 0,
      rejected: 4,
    })
  })

  it('dedupes Windows paths case-insensitively without reordering survivors', () => {
    expect(
      validateDroppedPaths(['C:\\Docs\\A.docx', 'c:\\docs\\a.DOCX', 'C:\\Docs\\B.pdf'], {
        platform: 'win32',
        isRegularFile: () => true,
      }),
    ).toEqual({
      paths: ['C:\\Docs\\A.docx', 'C:\\Docs\\B.pdf'],
      duplicates: 1,
      rejected: 0,
    })
  })

  it('caps work and counts entries beyond the cap as rejected', () => {
    const input = Array.from({ length: MAX_DROPPED_FILES + 3 }, (_, i) => `/docs/${i}.pdf`)
    const isRegularFile = vi.fn(() => true)
    const result = validateDroppedPaths(input, { platform: 'linux', isRegularFile })
    expect(result.paths).toHaveLength(MAX_DROPPED_FILES)
    expect(result.rejected).toBe(3)
    expect(isRegularFile).toHaveBeenCalledTimes(MAX_DROPPED_FILES)
  })
})

describe('routeDroppedPaths', () => {
  it('routes each validated path sequentially and counts failures', () => {
    const opened: string[] = []
    const result = routeDroppedPaths(
      ['/docs/a.docx', '/docs/b.pdf', '/docs/c.md'],
      (path) => {
        opened.push(path)
        if (path.endsWith('b.pdf')) throw new Error('open failed')
        return !path.endsWith('c.md')
      },
      { platform: 'linux', isRegularFile: () => true },
    )
    expect(opened).toEqual(['/docs/a.docx', '/docs/b.pdf', '/docs/c.md'])
    expect(result).toEqual({ opened: 1, duplicates: 0, rejected: 2 })
  })
})

describe('isTrustedDropSender', () => {
  it('allows only the shell renderer or a managed live editor WebContents', () => {
    const ownsEditor = (id: number) => id === 22
    expect(isTrustedDropSender(11, 11, ownsEditor)).toBe(true)
    expect(isTrustedDropSender(22, 11, ownsEditor)).toBe(true)
    expect(isTrustedDropSender(33, 11, ownsEditor)).toBe(false)
    expect(isTrustedDropSender(33, undefined, ownsEditor)).toBe(false)
  })
})
