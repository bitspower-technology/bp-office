/** One-shot shell-opened workbook paths, isolated by editor WebContents id. */
export class QueuedWorkbookPaths {
  private readonly paths = new Map<number, string>()

  set(webContentsId: number, path: string): void {
    this.paths.set(webContentsId, path)
  }

  has(webContentsId?: number): boolean {
    return webContentsId === undefined ? this.paths.size > 0 : this.paths.has(webContentsId)
  }

  take(webContentsId: number): string | undefined {
    const path = this.paths.get(webContentsId)
    this.paths.delete(webContentsId)
    return path
  }

  delete(webContentsId: number): void {
    this.paths.delete(webContentsId)
  }
}
