import { describe, expect, it, vi } from 'vitest'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { BookmarkInput } from '../src/shared/ipc'
import type { OutlineNode } from '../src/renderer/OutlinePanel'
import {
  applyBookmarkEdit,
  bookmarksToOutline,
  outlineToBookmarks,
  pruneBookmarksForDeletedPage,
  pruneOutlineForDeletedPages,
  remapBookmarkPages,
  resolveOutlinePages,
} from '../src/renderer/bookmarks'

describe('PDF bookmark renderer model', () => {
  it('resolves and preserves the source FitH view, color, style, expansion, and hierarchy', async () => {
    const ref = { num: 9, gen: 0 }
    const doc = {
      numPages: 4,
      getDestination: vi.fn(async () => [ref, { name: 'FitH' }, 846]),
      getPageIndex: vi.fn(async () => 2),
    } as unknown as PDFDocumentProxy
    const resolved = await resolveOutlinePages(doc, [
      {
        title: '競賽規程',
        bold: true,
        color: new Uint8ClampedArray([51, 102, 153]),
        count: -1,
        dest: 'chapter-one',
        items: [{ title: '資格', italic: true, dest: [1, { name: 'Fit' }] }],
      },
    ])

    expect(resolved).toEqual([
      expect.objectContaining({
        title: '競賽規程',
        pageIndex: 2,
        view: { type: 'FitH', args: [846] },
        color: [0.2, 0.4, 0.6],
        expanded: false,
        items: [
          expect.objectContaining({
            title: '資格',
            italic: true,
            pageIndex: 1,
            view: { type: 'Fit' },
          }),
        ],
      }),
    ])
    expect(outlineToBookmarks(resolved, 4)).toEqual({
      ok: true,
      bookmarks: [
        {
          title: '競賽規程',
          pageIndex: 2,
          bold: true,
          view: { type: 'FitH', args: [846] },
          color: [0.2, 0.4, 0.6],
          expanded: false,
          children: [
            {
              title: '資格',
              pageIndex: 1,
              italic: true,
              view: { type: 'Fit' },
            },
          ],
        },
      ],
    })
  })

  it('preserves XYZ destinations and fails closed for unsupported views and external links', async () => {
    const doc = {
      numPages: 1,
      getPageIndex: vi.fn(async () => 0),
    } as unknown as PDFDocumentProxy
    const resolved = await resolveOutlinePages(doc, [
      { title: 'XYZ', dest: [0, { name: 'XYZ' }, null, 72, 1.25] },
      { title: 'Unsupported', dest: [0, { name: 'UnknownView' }, 1, 2, 3] },
    ])
    expect(resolved[0]).toEqual(
      expect.objectContaining({ view: { type: 'XYZ', args: [null, 72, 1.25] } }),
    )
    expect(outlineToBookmarks([resolved[0]!], 1)).toEqual({
      ok: true,
      bookmarks: [
        {
          title: 'XYZ',
          pageIndex: 0,
          view: { type: 'XYZ', args: [null, 72, 1.25] },
        },
      ],
    })
    expect(outlineToBookmarks([resolved[1]!], 1)).toEqual({
      ok: false,
      error: expect.stringContaining('destination view UnknownView is unsupported'),
    })
    expect(outlineToBookmarks([{ title: 'Web', url: 'https://example.com' }], 1)).toEqual({
      ok: false,
      error: expect.stringContaining('external link'),
    })
  })

  it('updates one node without losing destination metadata or sibling hierarchy', () => {
    const source: BookmarkInput[] = [
      {
        title: 'Old',
        pageIndex: 0,
        view: { type: 'FitH', args: [846] },
        color: [0.2, 0.4, 0.6],
        expanded: false,
        children: [{ title: 'Child', pageIndex: 1, view: { type: 'FitV', args: [null] } }],
      },
      { title: 'Sibling', pageIndex: 2 },
    ]
    const result = applyBookmarkEdit(source, {
      action: 'update',
      path: '1',
      title: '新標題',
      bold: true,
    })
    expect(result).toEqual({
      ok: true,
      description: 'Updated bookmark 1',
      bookmarks: [{ ...source[0], title: '新標題', bold: true }, source[1]],
    })
    expect(source[0]!.title).toBe('Old')
  })

  it('rejects lone UTF-16 surrogates before they reach the save path', () => {
    expect(applyBookmarkEdit([], { action: 'create', title: '\ud800', pageIndex: 0 })).toEqual({
      ok: false,
      error: 'Bookmark title must contain valid Unicode',
    })
    expect(
      outlineToBookmarks([{ title: '\udc00', pageIndex: 0, view: { type: 'Fit' } }], 1),
    ).toEqual({ ok: false, error: expect.stringContaining('valid Unicode') })
  })

  it('bounds hostile outline depth and marks the visible tree uneditable', async () => {
    let nested: OutlineNode = { title: 'Level 33', dest: [0, { name: 'Fit' }] }
    for (let depth = 32; depth >= 1; depth--)
      nested = { title: `Level ${depth}`, dest: [0, { name: 'Fit' }], items: [nested] }
    const doc = { numPages: 1 } as unknown as PDFDocumentProxy
    const resolved = await resolveOutlinePages(doc, [nested])
    let cursor = resolved[0]
    for (let depth = 1; depth <= 32; depth++) cursor = cursor?.items?.[0]
    expect(cursor?.title).toBe('[Outline truncated for safety]')
    expect(cursor?.viewError).toContain('32-level safety limit')
    expect(outlineToBookmarks(resolved, 1)).toEqual({
      ok: false,
      error: expect.stringContaining('32-level safety limit'),
    })
  })

  it('bounds hostile outline fan-out and marks the visible tree uneditable', async () => {
    const doc = { numPages: 1 } as unknown as PDFDocumentProxy
    const resolved = await resolveOutlinePages(
      doc,
      Array.from({ length: 1_100 }, (_, index) => ({
        title: `Bookmark ${index}`,
        dest: [0, { name: 'Fit' }],
      })),
    )
    expect(resolved).toHaveLength(1_001)
    expect(resolved.at(-1)).toEqual({
      title: '[Outline truncated for safety]',
      viewError: expect.stringContaining('1000-bookmark safety limit'),
    })
    expect(outlineToBookmarks(resolved, 1)).toEqual({
      ok: false,
      error: expect.stringContaining('1000-bookmark safety limit'),
    })
  })

  it('prunes a deleted destination, promotes its children, and remaps after save', () => {
    const source: BookmarkInput[] = [
      {
        title: 'Delete page 2',
        pageIndex: 1,
        children: [
          { title: 'Keep page 1', pageIndex: 0 },
          { title: 'Keep page 3', pageIndex: 2 },
        ],
      },
      { title: 'Tail', pageIndex: 3 },
    ]
    const pruned = pruneBookmarksForDeletedPage(source, 1)
    expect(pruned.map((bookmark) => bookmark.title)).toEqual(['Keep page 1', 'Keep page 3', 'Tail'])
    expect(
      remapBookmarkPages(
        pruned,
        new Map([
          [0, 0],
          [2, 1],
          [3, 2],
        ]),
      ),
    ).toEqual([
      { title: 'Keep page 1', pageIndex: 0 },
      { title: 'Keep page 3', pageIndex: 1 },
      { title: 'Tail', pageIndex: 2 },
    ])
    expect(
      pruneOutlineForDeletedPages(bookmarksToOutline(source), (pageIndex) => pageIndex === 1).map(
        (bookmark) => bookmark.title,
      ),
    ).toEqual(['Keep page 1', 'Keep page 3', 'Tail'])
  })
})
