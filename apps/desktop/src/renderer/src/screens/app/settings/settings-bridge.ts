import { createPreviewSettings } from '@/lib/preview-settings'

import type { TSettingsBridge } from '../../../../../preload/bridge-types'

export type { TSettingsBridge }

let found: TSettingsBridge | null | undefined

/**
 * The way to the server's settings: the real bridge in Electron. In a
 * browser tab during development, `?preview=signed-in` swaps in a pretend
 * server; otherwise there's none.
 */
export const getSettingsBridge = (): TSettingsBridge | null => {
  if (found === undefined) {
    found =
      window.openSales?.settings ??
      (import.meta.env.DEV
        ? createPreviewSettings(window.location.search)
        : null)
  }
  return found
}
