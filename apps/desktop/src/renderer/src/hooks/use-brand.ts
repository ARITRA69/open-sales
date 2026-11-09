import type { TBrand } from '@open-sales/shared'

import brandConfig from '../../../../brand.config.json'

const DEFAULT_BRAND: TBrand = { productName: brandConfig.productName }

/**
 * The product's name and look. Read it here rather than writing "Open Sales"
 * in the UI, so a self-hoster can rebrand. For now it's the brand config's
 * defaults; the server's branding settings will override them.
 */
export const useBrand = (): TBrand => DEFAULT_BRAND
