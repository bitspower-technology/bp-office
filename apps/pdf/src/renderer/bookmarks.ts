import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { BookmarkInput } from '../shared/ipc'
import type { OutlineNode } from './OutlinePanel'

const MAX_BOOKMARKS = 1_000
const MAX_DEPTH = 32
const MAX_TITLE_LENGTH = 512

function hasValidUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return false
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) return false
  }
  return true
}

export type BookmarkEdit =
  | {
      action: 'create'
      title: string
      pageIndex: number
      parentPath?: string
      position?: number
      bold?: boolean
      italic?: boolean
    }
  | {
      action: 'update'
      path: string
      title?: string
      pageIndex?: number
      bold?: boolean
      italic?: boolean
    }
  | { action: 'delete'; path: string }
  | { action: 'move'; path: string; parentPath?: string; position?: number }

export type BookmarkEditResult =
  { ok: true; bookmarks: BookmarkInput[]; description: string } | { ok: false; error: string }

export type EditableBookmarkTree =
  { ok: true; bookmarks: BookmarkInput[] } | { ok: false; error: string }

/** Resolve a pdf.js outline's destinations once so the sidebar and AI tools share
 * stable source-page indices. Corrupt/external nodes remain readable but fail closed
 * if an edit would otherwise replace them with a lossy internal-only tree. */
export async function resolveOutlinePages(
  doc: PDFDocumentProxy,
  outline: readonly OutlineNode[],
): Promise<OutlineNode[]> {
  const resolveDestination = async (
    dest: unknown,
  ): Promise<Pick<OutlineNode, 'pageIndex' | 'view' | 'viewError'>> => {
    try {
      const array = typeof dest === 'string' ? await doc.getDestination(dest) : dest
      if (!Array.isArray(array)) return {}
      const ref = array[0]
      const pageIndex =
        typeof ref === 'number'
          ? ref
          : await doc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0])
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= doc.numPages) return {}

      const type = (array[1] as { name?: unknown } | undefined)?.name
      const args = array.slice(2)
      const nullableNumber = (value: unknown): value is number | null =>
        value === null || (typeof value === 'number' && Number.isFinite(value))
      const finiteNumber = (value: unknown): value is number =>
        typeof value === 'number' && Number.isFinite(value)
      const valid =
        (type === 'Fit' && args.length === 0) ||
        (type === 'FitB' && args.length === 0) ||
        ((type === 'FitH' || type === 'FitV' || type === 'FitBH' || type === 'FitBV') &&
          args.length === 1 &&
          nullableNumber(args[0])) ||
        (type === 'XYZ' && args.length === 3 && args.every(nullableNumber)) ||
        (type === 'FitR' && args.length === 4 && args.every(finiteNumber))
      if (!valid) {
        return {
          pageIndex,
          viewError: `destination view ${typeof type === 'string' ? type : '(missing)'} is unsupported`,
        }
      }
      return {
        pageIndex,
        view: {
          type,
          ...(args.length > 0 ? { args: args as (number | null)[] } : {}),
        },
      }
    } catch {
      return {}
    }
  }

  const state = { count: 0, truncated: false }
  const truncatedNode = (reason: string): OutlineNode => ({
    title: '[Outline truncated for safety]',
    viewError: reason,
  })
  const walk = async (nodes: readonly OutlineNode[], depth: number): Promise<OutlineNode[]> => {
    const resolved: OutlineNode[] = []
    for (const node of nodes) {
      if (state.count >= MAX_BOOKMARKS) {
        if (!state.truncated) {
          state.truncated = true
          resolved.push(truncatedNode(`outline exceeds the ${MAX_BOOKMARKS}-bookmark safety limit`))
        }
        break
      }
      state.count++
      const destination = node.url ? {} : await resolveDestination(node.dest)
      const channels = node.color ? [...node.color] : []
      const color =
        channels.length === 3 && channels.some((channel) => channel !== 0)
          ? (channels.map((channel) => channel / 255) as [number, number, number])
          : undefined
      let items: OutlineNode[] | undefined
      if (node.items?.length) {
        items =
          depth >= MAX_DEPTH
            ? [truncatedNode(`bookmark nesting exceeds the ${MAX_DEPTH}-level safety limit`)]
            : await walk(node.items, depth + 1)
      }
      resolved.push({
        ...node,
        ...destination,
        color,
        expanded: node.count === undefined ? undefined : node.count >= 0,
        ...(items ? { items } : {}),
      })
    }
    return resolved
  }
  return walk(outline, 1)
}

/** Convert the visible outline to the complete internal bookmark tree used by Save.
 * Refuse external, missing, or corrupt destinations instead of silently deleting them. */
export function outlineToBookmarks(
  outline: readonly OutlineNode[] | null,
  pageCount: number,
): EditableBookmarkTree {
  let count = 0
  const walk = (nodes: readonly OutlineNode[], path: string, depth: number): BookmarkInput[] => {
    if (depth > MAX_DEPTH) {
      const marker = nodes.find((node) => node.viewError)?.viewError
      throw new Error(marker ?? `bookmark nesting exceeds ${MAX_DEPTH} levels`)
    }
    return nodes.map((node, index) => {
      const nodePath = path ? `${path}.${index + 1}` : String(index + 1)
      if (node.viewError) throw new Error(`bookmark ${nodePath} ${node.viewError}`)
      count++
      if (count > MAX_BOOKMARKS)
        throw new Error(`the outline contains more than ${MAX_BOOKMARKS} bookmarks`)
      if (node.url) throw new Error(`bookmark ${nodePath} is an external link`)
      if (!Number.isInteger(node.pageIndex) || node.pageIndex! < 0 || node.pageIndex! >= pageCount)
        throw new Error(`bookmark ${nodePath} has an unavailable destination`)
      if (typeof node.title !== 'string' || !node.title.trim())
        throw new Error(`bookmark ${nodePath} has an empty title`)
      if (!hasValidUnicode(node.title))
        throw new Error(`bookmark ${nodePath} title must contain valid Unicode`)
      if (node.title.length > MAX_TITLE_LENGTH)
        throw new Error(
          `bookmark ${nodePath} has a title longer than ${MAX_TITLE_LENGTH} characters`,
        )
      return {
        title: node.title,
        pageIndex: node.pageIndex!,
        ...(node.bold ? { bold: true } : {}),
        ...(node.italic ? { italic: true } : {}),
        ...(node.view ? { view: node.view } : {}),
        ...(node.color ? { color: [...node.color] as [number, number, number] } : {}),
        ...(node.expanded === undefined ? {} : { expanded: node.expanded }),
        ...(node.items?.length ? { children: walk(node.items, nodePath, depth + 1) } : {}),
      }
    })
  }

  try {
    return { ok: true, bookmarks: walk(outline ?? [], '', 1) }
  } catch (error) {
    return {
      ok: false,
      error: `This outline cannot be edited safely because ${(error as Error).message}.`,
    }
  }
}

export function bookmarksToOutline(bookmarks: readonly BookmarkInput[]): OutlineNode[] {
  return bookmarks.map((bookmark) => ({
    title: bookmark.title,
    pageIndex: bookmark.pageIndex,
    bold: bookmark.bold,
    italic: bookmark.italic,
    view: bookmark.view,
    color: bookmark.color,
    expanded: bookmark.expanded,
    ...(bookmark.children ? { items: bookmarksToOutline(bookmark.children) } : {}),
  }))
}

/** Hide bookmarks whose destination page is pending deletion while promoting their
 * children, matching the pending save tree. External/unresolved nodes are retained. */
export function pruneOutlineForDeletedPages(
  outline: readonly OutlineNode[],
  isDeleted: (pageIndex: number) => boolean,
): OutlineNode[] {
  return outline.flatMap((node) => {
    const items = pruneOutlineForDeletedPages(node.items ?? [], isDeleted)
    if (node.pageIndex !== undefined && isDeleted(node.pageIndex)) return items
    const { items: _oldItems, ...rest } = node
    return [{ ...rest, ...(items.length ? { items } : {}) }]
  })
}

function cloneTree(bookmarks: readonly BookmarkInput[]): BookmarkInput[] {
  return bookmarks.map((bookmark) => ({
    ...bookmark,
    ...(bookmark.children ? { children: cloneTree(bookmark.children) } : {}),
  }))
}

function pathParts(path: string): number[] | null {
  const value = path.trim()
  if (!/^\d+(?:\.\d+)*$/.test(value)) return null
  const parts = value.split('.').map(Number)
  return parts.every((part) => Number.isSafeInteger(part) && part >= 1) ? parts : null
}

interface LocatedBookmark {
  list: BookmarkInput[]
  index: number
  node: BookmarkInput
}

function locate(bookmarks: BookmarkInput[], path: string): LocatedBookmark | null {
  const parts = pathParts(path)
  if (!parts) return null
  let list = bookmarks
  for (let depth = 0; depth < parts.length; depth++) {
    const index = parts[depth]! - 1
    const node = list[index]
    if (!node) return null
    if (depth === parts.length - 1) return { list, index, node }
    list = node.children ?? []
  }
  return null
}

function titleResult(raw: string): { ok: true; title: string } | { ok: false; error: string } {
  const title = raw.trim()
  if (!title) return { ok: false, error: 'Bookmark title must not be empty' }
  if (!hasValidUnicode(title))
    return { ok: false, error: 'Bookmark title must contain valid Unicode' }
  if (title.length > MAX_TITLE_LENGTH)
    return { ok: false, error: `Bookmark title cannot exceed ${MAX_TITLE_LENGTH} characters` }
  return { ok: true, title }
}

function insertionIndex(position: number | undefined, length: number): number | null {
  if (position === undefined) return length
  return Number.isInteger(position) && position >= 1 && position <= length + 1 ? position - 1 : null
}

function contains(root: BookmarkInput, candidate: BookmarkInput): boolean {
  if (root === candidate) return true
  return (root.children ?? []).some((child) => contains(child, candidate))
}

function countBookmarks(bookmarks: readonly BookmarkInput[]): number {
  return bookmarks.reduce((sum, bookmark) => sum + 1 + countBookmarks(bookmark.children ?? []), 0)
}

/** Apply one validated mutation to a cloned tree. Paths are 1-based (`2.1`). */
export function applyBookmarkEdit(
  current: readonly BookmarkInput[],
  edit: BookmarkEdit,
): BookmarkEditResult {
  const bookmarks = cloneTree(current)
  if (edit.action === 'create') {
    if (countBookmarks(bookmarks) >= MAX_BOOKMARKS)
      return { ok: false, error: `A PDF can contain at most ${MAX_BOOKMARKS} edited bookmarks` }
    const title = titleResult(edit.title)
    if (!title.ok) return title
    let list = bookmarks
    if (edit.parentPath) {
      const parent = locate(bookmarks, edit.parentPath)
      if (!parent) return { ok: false, error: `Bookmark path ${edit.parentPath} was not found` }
      const depth = pathParts(edit.parentPath)!.length + 1
      if (depth > MAX_DEPTH)
        return { ok: false, error: `Bookmark nesting cannot exceed ${MAX_DEPTH} levels` }
      parent.node.children ??= []
      list = parent.node.children
    }
    const index = insertionIndex(edit.position, list.length)
    if (index === null)
      return { ok: false, error: `Position must be between 1 and ${list.length + 1}` }
    const node: BookmarkInput = {
      title: title.title,
      pageIndex: edit.pageIndex,
      ...(edit.bold ? { bold: true } : {}),
      ...(edit.italic ? { italic: true } : {}),
    }
    list.splice(index, 0, node)
    return {
      ok: true,
      bookmarks,
      description: `Created bookmark "${node.title}" at page ${node.pageIndex + 1}`,
    }
  }

  const found = locate(bookmarks, edit.path)
  if (!found) return { ok: false, error: `Bookmark path ${edit.path} was not found` }

  if (edit.action === 'delete') {
    found.list.splice(found.index, 1)
    return { ok: true, bookmarks, description: `Deleted bookmark ${edit.path}` }
  }

  if (edit.action === 'update') {
    if (edit.title !== undefined) {
      const title = titleResult(edit.title)
      if (!title.ok) return title
      found.node.title = title.title
    }
    if (edit.pageIndex !== undefined) found.node.pageIndex = edit.pageIndex
    if (edit.bold !== undefined) {
      if (edit.bold) found.node.bold = true
      else delete found.node.bold
    }
    if (edit.italic !== undefined) {
      if (edit.italic) found.node.italic = true
      else delete found.node.italic
    }
    return { ok: true, bookmarks, description: `Updated bookmark ${edit.path}` }
  }

  let destination = bookmarks
  let parent: BookmarkInput | undefined
  if (edit.parentPath) {
    const locatedParent = locate(bookmarks, edit.parentPath)
    if (!locatedParent)
      return { ok: false, error: `Bookmark path ${edit.parentPath} was not found` }
    parent = locatedParent.node
    if (contains(found.node, parent))
      return { ok: false, error: 'A bookmark cannot be moved inside itself or its descendants' }
    const depth = pathParts(edit.parentPath)!.length + 1
    const subtreeDepth = (node: BookmarkInput): number =>
      1 + Math.max(0, ...(node.children ?? []).map(subtreeDepth))
    if (depth + subtreeDepth(found.node) - 1 > MAX_DEPTH)
      return { ok: false, error: `Bookmark nesting cannot exceed ${MAX_DEPTH} levels` }
  }
  found.list.splice(found.index, 1)
  if (parent) {
    parent.children ??= []
    destination = parent.children
  }
  const index = insertionIndex(edit.position, destination.length)
  if (index === null)
    return { ok: false, error: `Position must be between 1 and ${destination.length + 1}` }
  destination.splice(index, 0, found.node)
  return { ok: true, bookmarks, description: `Moved bookmark ${edit.path}` }
}

/** Drop bookmarks targeting a deleted source page while promoting their children at
 * the same position, so deleting a section page does not discard valid descendants. */
export function pruneBookmarksForDeletedPage(
  bookmarks: readonly BookmarkInput[],
  pageIndex: number,
): BookmarkInput[] {
  return bookmarks.flatMap((bookmark) => {
    const children = pruneBookmarksForDeletedPage(bookmark.children ?? [], pageIndex)
    if (bookmark.pageIndex === pageIndex) return children
    const { children: _oldChildren, ...rest } = bookmark
    return [{ ...rest, ...(children.length ? { children } : {}) }]
  })
}

/** Remap a pending tree through a save that changed physical page indices. */
export function remapBookmarkPages(
  bookmarks: readonly BookmarkInput[],
  pageMap: ReadonlyMap<number, number>,
): BookmarkInput[] {
  return bookmarks.flatMap((bookmark) => {
    const children = remapBookmarkPages(bookmark.children ?? [], pageMap)
    const pageIndex = pageMap.get(bookmark.pageIndex)
    if (pageIndex === undefined) return children
    const { children: _oldChildren, ...rest } = bookmark
    return [{ ...rest, pageIndex, ...(children.length ? { children } : {}) }]
  })
}
