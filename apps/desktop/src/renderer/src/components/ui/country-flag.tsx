import { cn } from '@/lib/utils'

/*
 * Country flags from country-flag-icons (MIT): one small SVG per country,
 * loaded as an image only when it's shown. Emoji flags would be simpler, but
 * Windows shows them as two letters. Like the AI tool logos, flags are
 * images, so they're the exception to "colours only from tokens.css".
 */
const FLAG_FILES = import.meta.glob<string>(
  // The workspace hoists packages to the repo root (bunfig.toml).
  '../../../../../../../node_modules/country-flag-icons/3x2/*.svg',
  { query: '?url', import: 'default', eager: true }
)

const FLAG_URLS = new Map(
  Object.entries(FLAG_FILES).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.svg'.length),
    url
  ])
)

type TCountryFlagProps = {
  // ISO 3166 code, like "GB".
  code: string
  className?: string
}

/** A country's flag, 18 by 12. A grey tile if there's none. */
export const CountryFlag = ({ code, className }: TCountryFlagProps) => {
  const url = FLAG_URLS.get(code.toUpperCase())

  return url ? (
    <img
      alt=""
      className={cn(
        'h-3 w-4.5 flex-none rounded-xs object-cover shadow-(--shadow-tile)',
        className
      )}
      data-slot="country-flag"
      draggable={false}
      loading="lazy"
      src={url}
    />
  ) : (
    <span
      aria-hidden
      className={cn('h-3 w-4.5 flex-none rounded-xs bg-secondary', className)}
    />
  )
}
