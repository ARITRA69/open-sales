import type { ComponentProps } from 'react'

/**
 * The kit's links. A plain anchor for now: in-app routes use `#/` hashes, and the
 * main process opens web links in the default browser.
 */
export const Link = (linkProps: ComponentProps<'a'>) => <a {...linkProps} />
