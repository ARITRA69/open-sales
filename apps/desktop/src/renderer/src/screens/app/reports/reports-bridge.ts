import { createPreviewReports } from '@/lib/preview-bridge'

import type { TOpenSalesBridge } from '../../../../../preload/bridge-types'

export type TReportsBridge = TOpenSalesBridge['reports']

/**
 * The real bridge in Electron. In a browser tab during development,
 * `?preview=signed-in` swaps in pretend reports; otherwise there's none, and
 * the page shows its empty state.
 */
export const REPORTS_BRIDGE: TReportsBridge | null =
  window.openSales?.reports ??
  (import.meta.env.DEV ? createPreviewReports(window.location.search) : null)
