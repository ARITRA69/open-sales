/** Keep React's numeric CSS lengths in pixels when passing them through a variable. */
export const toCssLength = (
  value: string | number | null | undefined
): string | null | undefined =>
  typeof value === 'number' ? `${value}px` : value
