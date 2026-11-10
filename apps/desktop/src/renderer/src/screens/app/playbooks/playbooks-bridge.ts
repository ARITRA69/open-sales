import type { Role } from '@open-sales/shared'

import { createPreviewPlaybooks, previewRole } from '@/lib/preview-playbooks'

import type { TOpenSalesBridge } from '../../../../../preload/bridge-types'

export type TPlaybooksBridge = TOpenSalesBridge['playbooks']

const hasWindow = typeof window !== 'undefined'
// A browser tab in development, with `?preview=…`: there's no Electron bridge.
const isPreview = hasWindow && import.meta.env.DEV && !window.openSales

/**
 * The app's own way to reach playbooks: the real bridge in Electron, or the
 * pretend server in the browser preview. Null where there's neither, such as
 * a test, which passes its own.
 */
export const DEFAULT_PLAYBOOKS_BRIDGE: TPlaybooksBridge | null = hasWindow
  ? (window.openSales?.playbooks ??
    (isPreview ? createPreviewPlaybooks(window.location.search) : null))
  : null

/** `&role=member` in the browser preview shows the page as that role. */
export const PREVIEW_ROLE: Role | null = isPreview
  ? previewRole(window.location.search)
  : null
