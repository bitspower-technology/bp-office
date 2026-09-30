import { TABS_CHANNELS } from '../shared/tabs-api'

interface ChromePressedTarget {
  id: number
  isDestroyed(): boolean
  send(channel: string): void
}

/** A renderer already saw its own pointer event; only sibling views need the relay. */
export function relayChromePressed(
  targets: readonly ChromePressedTarget[],
  senderId?: number,
): void {
  for (const target of targets) {
    if (target.id !== senderId && !target.isDestroyed()) target.send(TABS_CHANNELS.chromePressed)
  }
}
