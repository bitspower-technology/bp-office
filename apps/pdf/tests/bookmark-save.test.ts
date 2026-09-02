import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { applySaveRequest } from '../src/main/save-pdf'
import type { BookmarkInput, SavePdfRequest } from '../src/shared/ipc'

async function makePdf(pageCount = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let index = 0; index < pageCount; index++) doc.addPage([300 + index, 400 + index])
  return doc.save({ useObjectStreams: false })
}

const request = (
  bookmarks: BookmarkInput[],
  over: Partial<SavePdfRequest> = {},
): SavePdfRequest => ({
  path: '/tmp/bookmarks.pdf',
  markups: [],
  drawings: [],
  formValues: [],
  stamps: [],
  bookmarks,
  ...over,
})

async function parsedOutline(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice() })
  const doc = await task.promise
  try {
    const outline = await doc.getOutline()
    const pages = new Map<string, number>()
    const visit = async (items: Awaited<ReturnType<typeof doc.getOutline>>): Promise<void> => {
      for (const item of items ?? []) {
        if (Array.isArray(item.dest)) {
          pages.set(item.title, (await doc.getPageIndex(item.dest[0])) + 1)
        }
        await visit(item.items)
      }
    }
    await visit(outline)
    return { outline, pages }
  } finally {
    await task.destroy()
  }
}

describe('PDF bookmark persistence', () => {
  it('writes Unicode titles, hierarchy, styles, and page destinations', async () => {
    const input: BookmarkInput[] = [
      {
        title: '規程',
        pageIndex: 0,
        bold: true,
        color: [0, 0.5, 1],
        view: { type: 'FitH', args: [846] },
        expanded: false,
        children: [
          {
            title: 'Eligibility – 資格',
            pageIndex: 1,
            italic: true,
            view: { type: 'XYZ', args: [null, 720, null] },
          },
        ],
      },
      { title: '  Final page 😀  ', pageIndex: 2 },
    ]
    const { bytes } = await applySaveRequest(await makePdf(), request(input))
    const parsed = await parsedOutline(bytes)
    expect(parsed.outline?.map((item) => item.title)).toEqual(['規程', '  Final page 😀  '])
    expect(parsed.outline?.[0]?.bold).toBe(true)
    expect(parsed.outline?.[0]?.items[0]?.title).toBe('Eligibility – 資格')
    expect(parsed.outline?.[0]?.items[0]?.italic).toBe(true)
    expect(parsed.outline?.[0]?.dest?.[1]).toEqual({ name: 'FitH' })
    expect(parsed.outline?.[0]?.dest?.[2]).toBe(846)
    expect(parsed.outline?.[0]?.count).toBe(-1)
    expect([...parsed.outline![0]!.color]).toEqual([0, 128, 255])
    expect(Object.fromEntries(parsed.pages)).toEqual({
      規程: 1,
      'Eligibility – 資格': 2,
      '  Final page 😀  ': 3,
    })

    const saved = await PDFDocument.load(bytes)
    const rootRef = saved.catalog.get(PDFName.of('Outlines')) as PDFRef
    const root = saved.catalog.lookup(PDFName.of('Outlines'), PDFDict)
    const firstRef = root.get(PDFName.of('First')) as PDFRef
    const lastRef = root.get(PDFName.of('Last')) as PDFRef
    const first = saved.context.lookup(firstRef, PDFDict)
    const last = saved.context.lookup(lastRef, PDFDict)
    const childRef = first.get(PDFName.of('First')) as PDFRef
    const child = saved.context.lookup(childRef, PDFDict)
    expect(root.lookup(PDFName.of('Count'), PDFNumber).asNumber()).toBe(2)
    expect(first.get(PDFName.of('Parent'))?.toString()).toBe(rootRef.toString())
    expect(first.get(PDFName.of('Next'))?.toString()).toBe(lastRef.toString())
    expect(first.has(PDFName.of('Prev'))).toBe(false)
    expect(last.get(PDFName.of('Parent'))?.toString()).toBe(rootRef.toString())
    expect(last.get(PDFName.of('Prev'))?.toString()).toBe(firstRef.toString())
    expect(last.has(PDFName.of('Next'))).toBe(false)
    expect(first.get(PDFName.of('First'))?.toString()).toBe(childRef.toString())
    expect(first.get(PDFName.of('Last'))?.toString()).toBe(childRef.toString())
    expect(first.lookup(PDFName.of('Count'), PDFNumber).asNumber()).toBe(-1)
    expect(first.lookup(PDFName.of('F'), PDFNumber).asNumber()).toBe(2)
    expect(child.get(PDFName.of('Parent'))?.toString()).toBe(firstRef.toString())
    expect(child.lookup(PDFName.of('F'), PDFNumber).asNumber()).toBe(1)
    const childDestination = child.lookup(PDFName.of('Dest'), PDFArray)
    expect(childDestination.get(1).toString()).toBe('/XYZ')
    expect(childDestination.get(2).toString()).toBe('null')
    expect(childDestination.lookup(3, PDFNumber).asNumber()).toBe(720)
    expect(childDestination.get(4).toString()).toBe('null')
    const destination = first.lookup(PDFName.of('Dest'), PDFArray)
    expect(destination.get(1).toString()).toBe('/FitH')
    expect(destination.lookup(2, PDFNumber).asNumber()).toBe(846)
    const color = first.lookup(PDFName.of('C'), PDFArray)
    expect([0, 1, 2].map((index) => color.lookup(index, PDFNumber).asNumber())).toEqual([0, 0.5, 1])
  })

  it('keeps original page references valid after reordering', async () => {
    const { bytes } = await applySaveRequest(
      await makePdf(),
      request(
        [
          { title: 'Original page one', pageIndex: 0 },
          { title: 'Original page three', pageIndex: 2 },
        ],
        { pageOrder: [2, 1, 0] },
      ),
    )
    const { pages } = await parsedOutline(bytes)
    expect(Object.fromEntries(pages)).toEqual({
      'Original page one': 3,
      'Original page three': 1,
    })
  })

  it('removes the prior outline when the resulting tree is empty', async () => {
    const first = await applySaveRequest(
      await makePdf(1),
      request([{ title: 'Temporary', pageIndex: 0 }]),
    )
    const second = await applySaveRequest(first.bytes, request([]))
    expect((await parsedOutline(second.bytes)).outline).toBeNull()
    const saved = await PDFDocument.load(second.bytes)
    expect(saved.catalog.has(PDFName.of('Outlines'))).toBe(false)
  })

  it('preserves the prior outline when bookmark editing was not requested', async () => {
    const first = await applySaveRequest(
      await makePdf(1),
      request([{ title: 'Keep me', pageIndex: 0 }]),
    )
    const second = await applySaveRequest(first.bytes, request([], { bookmarks: undefined }))
    expect((await parsedOutline(second.bytes)).outline?.[0]?.title).toBe('Keep me')
  })

  it('fails closed instead of dropping tagged outline structure associations', async () => {
    const first = await applySaveRequest(
      await makePdf(1),
      request([{ title: 'Tagged', pageIndex: 0 }]),
    )
    const tagged = await PDFDocument.load(first.bytes)
    const root = tagged.catalog.lookup(PDFName.of('Outlines'), PDFDict)
    const item = root.lookup(PDFName.of('First'), PDFDict)
    const structure = tagged.context.register(tagged.context.obj({ Type: 'StructElem' }))
    item.set(PDFName.of('SE'), structure)
    const taggedBytes = await tagged.save({ useObjectStreams: false })

    await expect(
      applySaveRequest(taggedBytes, request([{ title: 'Changed', pageIndex: 0 }])),
    ).rejects.toThrow('structure associations')
  })

  it('rejects blank titles, deleted destinations, excessive nesting, and oversized trees', async () => {
    const source = await makePdf(2)
    await expect(
      applySaveRequest(source, request([{ title: '  ', pageIndex: 0 }])),
    ).rejects.toThrow('titles')
    await expect(
      applySaveRequest(
        source,
        request([{ title: 'Deleted', pageIndex: 1 }], { deletedPages: [1] }),
      ),
    ).rejects.toThrow('unavailable')

    let nested: BookmarkInput = { title: 'Leaf', pageIndex: 0 }
    for (let depth = 0; depth < 34; depth++)
      nested = { title: `Level ${depth}`, pageIndex: 0, children: [nested] }
    await expect(applySaveRequest(source, request([nested]))).rejects.toThrow('nesting')
    await expect(
      applySaveRequest(
        source,
        request(
          Array.from({ length: 1_001 }, (_, index) => ({ title: `Item ${index}`, pageIndex: 0 })),
        ),
      ),
    ).rejects.toThrow('at most')
    await expect(
      applySaveRequest(
        source,
        request([
          { title: 'Bad view', pageIndex: 0, view: { type: 'FitR', args: [0, 0, 10, null] } },
        ]),
      ),
    ).rejects.toThrow('FitR')
    await expect(
      applySaveRequest(source, request([{ title: 'Bad color', pageIndex: 0, color: [0, 1.1, 0] }])),
    ).rejects.toThrow('color')
    await expect(
      applySaveRequest(source, request([{ title: '\ud800', pageIndex: 0 }])),
    ).rejects.toThrow('valid Unicode')
  })
})
