import type { CSSProperties } from 'react'

export type TCssVariables = CSSProperties & {
  [TVariable in `--${string}`]?: string | number | null
}
