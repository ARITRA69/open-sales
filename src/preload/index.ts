import { contextBridge } from 'electron'

import type { TOpenSalesBridge } from './bridge-types'

const openSalesBridge: TOpenSalesBridge = {
  platform: process.platform
}

contextBridge.exposeInMainWorld('openSales', openSalesBridge)
