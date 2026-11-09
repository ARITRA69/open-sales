export type TOpenSalesBridge = {
  platform: string
}

declare global {
  interface Window {
    // Missing when the renderer runs in a plain browser tab or a test.
    openSales?: TOpenSalesBridge
  }
}
