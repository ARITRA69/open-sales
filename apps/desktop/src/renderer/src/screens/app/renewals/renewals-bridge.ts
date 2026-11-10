import { createPreviewRenewals } from '@/lib/preview-renewals'

import type { TOpenSalesBridge } from '../../../../../preload/bridge-types'

export type TRenewalsBridge = TOpenSalesBridge['renewals']

export type TRecordsBridge = TOpenSalesBridge['records']

// The preview's pretend contracts, kept while its records stay the same.
let preview: {
  records: TRecordsBridge | null
  bridge: TRenewalsBridge | null
} | null = null

/**
 * Where the Renewals page gets its data when nobody hands it a bridge: the
 * desktop app's own, or in the browser preview a pretend one that shares the
 * preview's records. Null anywhere else, and the page shows its empty state.
 */
export const findRenewalsBridge = (
  records: TRecordsBridge | null
): TRenewalsBridge | null => {
  if (typeof window === 'undefined') return null
  if (window.openSales?.renewals) return window.openSales.renewals
  if (!import.meta.env.DEV) return null
  if (preview?.records !== records) {
    preview = {
      records,
      bridge: createPreviewRenewals(window.location.search, records)
    }
  }
  return preview.bridge
}
