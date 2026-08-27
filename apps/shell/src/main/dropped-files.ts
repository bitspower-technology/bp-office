import { statSync } from 'node:fs'
import { posix, win32 } from 'node:path'

import type { OpenDroppedFilesResult } from '../shared/home-api'
import { MAX_DROPPED_FILES } from '../shared/home-api'

const SUPPORTED_EXTENSIONS = new Set([
  '.docx',
  '.xlsx',
  '.xlsm',
  '.xls',
  '.csv',
  '.pdf',
  '.md',
  '.markdown',
])
const MAX_DROPPED_PATH_LENGTH = 32_768

export interface DroppedPathValidationOptions {
  platform?: NodeJS.Platform
  isRegularFile?: (path: string) => boolean
}

export interface ValidatedDroppedPaths {
  paths: string[]
  duplicates: number
  rejected: number
}

/** Match paths the way the target platform does when activating an open tab. */
export function pathsReferToSameFile(
  left: string,
  right: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const pathApi = platform === 'win32' ? win32 : posix
  const normalizedLeft = pathApi.normalize(left)
  const normalizedRight = pathApi.normalize(right)
  return platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

function regularFileOnDisk(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Treat renderer input as hostile: inspect at most MAX_DROPPED_FILES entries,
 * accept only absolute existing regular files owned by a shipped editor, and
 * dedupe without changing the surviving input order.
 */
export function validateDroppedPaths(
  input: unknown,
  options: DroppedPathValidationOptions = {},
): ValidatedDroppedPaths {
  if (!Array.isArray(input)) return { paths: [], duplicates: 0, rejected: 1 }

  const platform = options.platform ?? process.platform
  const pathApi = platform === 'win32' ? win32 : posix
  const isRegularFile = options.isRegularFile ?? regularFileOnDisk
  const paths: string[] = []
  const seen = new Set<string>()
  let duplicates = 0
  let rejected = Math.max(0, input.length - MAX_DROPPED_FILES)

  for (const candidate of input.slice(0, MAX_DROPPED_FILES)) {
    if (
      typeof candidate !== 'string' ||
      candidate.length === 0 ||
      candidate.length > MAX_DROPPED_PATH_LENGTH ||
      !pathApi.isAbsolute(candidate)
    ) {
      rejected++
      continue
    }
    const normalized = pathApi.normalize(candidate)
    if (!SUPPORTED_EXTENSIONS.has(pathApi.extname(normalized).toLowerCase())) {
      rejected++
      continue
    }
    if (!isRegularFile(normalized)) {
      rejected++
      continue
    }
    const key = platform === 'win32' ? normalized.toLowerCase() : normalized
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    paths.push(normalized)
  }

  return { paths, duplicates, rejected }
}

/** Sender gate kept pure so both shell-renderer and managed-editor paths are tested. */
export function isTrustedDropSender(
  senderId: number,
  shellRendererId: number | undefined,
  ownsEditorWebContents: (id: number) => boolean,
): boolean {
  return senderId === shellRendererId || ownsEditorWebContents(senderId)
}

/** Validate a drop, then route each surviving path sequentially in input order. */
export function routeDroppedPaths(
  input: unknown,
  openPath: (path: string) => boolean,
  options: DroppedPathValidationOptions = {},
): OpenDroppedFilesResult {
  const validated = validateDroppedPaths(input, options)
  let opened = 0
  let rejected = validated.rejected
  for (const path of validated.paths) {
    try {
      if (openPath(path)) opened++
      else rejected++
    } catch {
      rejected++
    }
  }
  return { opened, duplicates: validated.duplicates, rejected }
}
