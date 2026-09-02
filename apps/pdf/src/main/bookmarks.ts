import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'
import type { BookmarkInput } from '../shared/ipc'

const MAX_BOOKMARKS = 1_000
const MAX_DEPTH = 32
const MAX_TITLE_LENGTH = 512
const VIEW_ARITY = {
  XYZ: 3,
  Fit: 0,
  FitH: 1,
  FitV: 1,
  FitR: 4,
  FitB: 0,
  FitBH: 1,
  FitBV: 1,
} as const

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function validateView(bookmark: BookmarkInput): void {
  if (bookmark.view === undefined) return
  if (!bookmark.view || typeof bookmark.view !== 'object' || Array.isArray(bookmark.view))
    throw new Error('PDF bookmark view must be an object')
  const arity = VIEW_ARITY[bookmark.view.type]
  if (arity === undefined) throw new Error('PDF bookmark view type is unsupported')
  const args = bookmark.view.args ?? []
  if (!Array.isArray(args) || args.length !== arity)
    throw new Error(`PDF bookmark ${bookmark.view.type} view requires ${arity} arguments`)
  if (
    args.some((value) => value !== null && (typeof value !== 'number' || !Number.isFinite(value)))
  )
    throw new Error('PDF bookmark view arguments must be finite numbers or null')
  if (bookmark.view.type === 'FitR' && args.some((value) => value === null))
    throw new Error('PDF bookmark FitR view arguments must be finite numbers')
}

function validateColor(bookmark: BookmarkInput): void {
  if (bookmark.color === undefined) return
  if (
    !Array.isArray(bookmark.color) ||
    bookmark.color.length !== 3 ||
    bookmark.color.some(
      (component) =>
        typeof component !== 'number' ||
        !Number.isFinite(component) ||
        component < 0 ||
        component > 1,
    )
  ) {
    throw new Error('PDF bookmark color must contain three RGB values between 0 and 1')
  }
}

function validateBookmarkTree(
  bookmarks: readonly BookmarkInput[],
  pageCount: number,
  deleted: ReadonlySet<number>,
  depth = 0,
  counter = { value: 0 },
): void {
  if (bookmarks.length === 0) return
  if (depth >= MAX_DEPTH) throw new Error(`PDF bookmark nesting cannot exceed ${MAX_DEPTH} levels`)
  for (const bookmark of bookmarks) {
    if (!bookmark || typeof bookmark !== 'object' || Array.isArray(bookmark))
      throw new Error('PDF bookmarks must be objects')
    counter.value++
    if (counter.value > MAX_BOOKMARKS)
      throw new Error(`A PDF can contain at most ${MAX_BOOKMARKS} edited bookmarks`)
    if (
      typeof bookmark.title !== 'string' ||
      !bookmark.title.trim() ||
      bookmark.title.length > MAX_TITLE_LENGTH ||
      hasUnpairedSurrogate(bookmark.title)
    ) {
      throw new Error(
        `PDF bookmark titles must contain valid Unicode and 1-${MAX_TITLE_LENGTH} characters`,
      )
    }
    if (
      !Number.isInteger(bookmark.pageIndex) ||
      bookmark.pageIndex < 0 ||
      bookmark.pageIndex >= pageCount ||
      deleted.has(bookmark.pageIndex)
    ) {
      throw new Error(`PDF bookmark page ${String(bookmark.pageIndex + 1)} is unavailable`)
    }
    if (bookmark.children !== undefined && !Array.isArray(bookmark.children))
      throw new Error('PDF bookmark children must be an array')
    if (bookmark.bold !== undefined && typeof bookmark.bold !== 'boolean')
      throw new Error('PDF bookmark bold must be a boolean')
    if (bookmark.italic !== undefined && typeof bookmark.italic !== 'boolean')
      throw new Error('PDF bookmark italic must be a boolean')
    if (bookmark.expanded !== undefined && typeof bookmark.expanded !== 'boolean')
      throw new Error('PDF bookmark expanded must be a boolean')
    validateView(bookmark)
    validateColor(bookmark)
    validateBookmarkTree(bookmark.children ?? [], pageCount, deleted, depth + 1, counter)
  }
}

interface WrittenLevel {
  refs: PDFRef[]
  total: number
  visible: number
}

/** Tagged outline associations are not exposed by pdf.js, so rebuilding such a tree
 * would silently break accessibility metadata. Refuse the edit instead. */
function assertNoTaggedOutlineAssociations(pdfDoc: PDFDocument): void {
  const root = pdfDoc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict)
  if (!root) return
  const visited = new Set<PDFDict>()
  let examined = 0
  const visitLevel = (first: PDFDict | undefined, depth: number): void => {
    let item = first
    while (item) {
      if (visited.has(item)) throw new Error('The source PDF bookmark tree contains a cycle')
      visited.add(item)
      examined++
      if (examined > MAX_BOOKMARKS)
        throw new Error(`The source PDF contains more than ${MAX_BOOKMARKS} bookmarks`)
      if (item.has(PDFName.of('SE'))) {
        throw new Error(
          'This tagged PDF outline cannot be edited safely because it contains structure associations.',
        )
      }
      const child = item.lookupMaybe(PDFName.of('First'), PDFDict)
      if (child) {
        if (depth >= MAX_DEPTH)
          throw new Error(`The source PDF bookmark nesting exceeds ${MAX_DEPTH} levels`)
        visitLevel(child, depth + 1)
      }
      item = item.lookupMaybe(PDFName.of('Next'), PDFDict)
    }
  }
  visitLevel(root.lookupMaybe(PDFName.of('First'), PDFDict), 1)
}

function writeLevel(
  pdfDoc: PDFDocument,
  bookmarks: readonly BookmarkInput[],
  pages: readonly PDFPage[],
  parent: PDFRef,
): WrittenLevel {
  const nodes = bookmarks.map((bookmark) => {
    const dict = pdfDoc.context.obj({ Parent: parent })
    dict.set(PDFName.of('Title'), PDFHexString.fromText(bookmark.title))
    const view = bookmark.view ?? { type: 'Fit' as const, args: [] }
    dict.set(
      PDFName.of('Dest'),
      pdfDoc.context.obj([
        pages[bookmark.pageIndex]!.ref,
        PDFName.of(view.type),
        ...(view.args ?? []),
      ]) as PDFArray,
    )
    const flags = (bookmark.italic ? 1 : 0) | (bookmark.bold ? 2 : 0)
    if (flags) dict.set(PDFName.of('F'), PDFNumber.of(flags))
    if (bookmark.color) dict.set(PDFName.of('C'), pdfDoc.context.obj(bookmark.color) as PDFArray)
    const ref = pdfDoc.context.register(dict)
    return { bookmark, dict, ref }
  })

  let total = nodes.length
  let visible = nodes.length
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!
    if (index > 0) node.dict.set(PDFName.of('Prev'), nodes[index - 1]!.ref)
    if (index + 1 < nodes.length) node.dict.set(PDFName.of('Next'), nodes[index + 1]!.ref)
    if ((node.bookmark.children?.length ?? 0) > 0) {
      const children = writeLevel(pdfDoc, node.bookmark.children!, pages, node.ref)
      node.dict.set(PDFName.of('First'), children.refs[0]!)
      node.dict.set(PDFName.of('Last'), children.refs.at(-1)!)
      node.dict.set(
        PDFName.of('Count'),
        PDFNumber.of(node.bookmark.expanded === false ? -children.visible : children.visible),
      )
      total += children.total
      if (node.bookmark.expanded !== false) visible += children.visible
    }
  }
  return { refs: nodes.map((node) => node.ref), total, visible }
}

/** Replace the catalog outline with a validated standard linked bookmark tree. */
export function applyBookmarks(
  pdfDoc: PDFDocument,
  bookmarks: readonly BookmarkInput[],
  sourcePages: readonly PDFPage[],
  deletedPages: readonly number[] = [],
): void {
  if (!Array.isArray(bookmarks)) throw new Error('PDF bookmarks must be an array')
  const deleted = new Set(deletedPages)
  validateBookmarkTree(bookmarks, sourcePages.length, deleted)
  if (bookmarks.length === 0) {
    pdfDoc.catalog.delete(PDFName.of('Outlines'))
    return
  }
  assertNoTaggedOutlineAssociations(pdfDoc)

  const root = pdfDoc.context.obj({ Type: 'Outlines' })
  const rootRef = pdfDoc.context.register(root)
  const level = writeLevel(pdfDoc, bookmarks, sourcePages, rootRef)
  root.set(PDFName.of('First'), level.refs[0]!)
  root.set(PDFName.of('Last'), level.refs.at(-1)!)
  root.set(PDFName.of('Count'), PDFNumber.of(level.visible))
  pdfDoc.catalog.set(PDFName.of('Outlines'), rootRef)
}
