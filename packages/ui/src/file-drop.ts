export interface FileDropOpenOptions {
  /** Called when an unhandled OS file drag enters or leaves the renderer. */
  onActiveChange?: (active: boolean) => void
  /** Override for tests; defaults to the current renderer window. */
  target?: Window
}

/** True only for an OS/browser file payload, never for ordinary text or in-app drags. */
export function hasFileDrop(dataTransfer: DataTransfer | null | undefined): boolean {
  return (
    dataTransfer !== null &&
    dataTransfer !== undefined &&
    Array.from(dataTransfer.types).includes('Files')
  )
}

/**
 * Prevent Chromium from navigating to files dropped outside an app-specific
 * drop target, and hand those files to the preload bridge. Listeners run in
 * the bubble phase and honor defaultPrevented, so attachment/image targets
 * retain priority by handling the event before it reaches the window.
 */
export function installFileDropOpen(
  openFiles: (files: File[]) => Promise<unknown> | unknown,
  options: FileDropOpenOptions = {},
): () => void {
  const target = options.target ?? window
  let dragDepth = 0
  let active = false

  const setActive = (next: boolean): void => {
    if (active === next) return
    active = next
    options.onActiveChange?.(next)
  }

  const reset = (): void => {
    dragDepth = 0
    setActive(false)
  }

  const onDragEnter = (event: DragEvent): void => {
    if (event.defaultPrevented || !hasFileDrop(event.dataTransfer)) return
    event.preventDefault()
    dragDepth += 1
    setActive(true)
  }

  const onDragOver = (event: DragEvent): void => {
    if (event.defaultPrevented || !hasFileDrop(event.dataTransfer)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    setActive(true)
  }

  const onDragLeave = (event: DragEvent): void => {
    if (event.defaultPrevented || !active) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0 || (event.target === target && event.relatedTarget === null)) reset()
  }

  const onDrop = (event: DragEvent): void => {
    const handled = event.defaultPrevented
    reset()
    if (handled || !hasFileDrop(event.dataTransfer)) return
    event.preventDefault()
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length === 0) return
    void Promise.resolve(openFiles(files)).catch(() => undefined)
  }

  target.addEventListener('dragenter', onDragEnter)
  target.addEventListener('dragover', onDragOver)
  target.addEventListener('dragleave', onDragLeave)
  target.addEventListener('drop', onDrop)
  target.addEventListener('dragend', reset)

  return () => {
    target.removeEventListener('dragenter', onDragEnter)
    target.removeEventListener('dragover', onDragOver)
    target.removeEventListener('dragleave', onDragLeave)
    target.removeEventListener('drop', onDrop)
    target.removeEventListener('dragend', reset)
    reset()
  }
}
