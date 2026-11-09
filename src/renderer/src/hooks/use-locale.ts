type TTranslationValues = Record<string, string | number>

const fillValues = (message: string, values: TTranslationValues = {}) =>
  message.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder
  )

/**
 * The app is English only for now. The kit calls `t()` on its copy, so a
 * translation can be added later; today this only fills in the values.
 */
export const useLocale = () => ({ t: fillValues })
