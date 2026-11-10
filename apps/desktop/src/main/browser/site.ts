/*
 * Addresses and sites. A "site" is what the person approves for AI: the host
 * without `www.`, with its port if it has one. Plain http is a different
 * site from https, since anyone on the network can change what it shows.
 */

const SEARCH_URL = 'https://www.google.com/search?q='

const parse = (url: string) => {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** Whether a tab may load this: web pages only, never files or app pages. */
export const isWebUrl = (url: string) => {
  const parsed = parse(url)
  return parsed?.protocol === 'https:' || parsed?.protocol === 'http:'
}

/** The site an address belongs to, or null for anything that isn't the web. */
export const siteOf = (url: string): string | null => {
  const parsed = parse(url)
  if (!parsed || !isWebUrl(url)) return null
  // `URL` has already lower-cased the host and put it in punycode.
  const host = parsed.hostname.replace(/^www\./, '')
  if (!host) return null
  const withPort = parsed.port ? `${host}:${parsed.port}` : host
  return parsed.protocol === 'http:' ? `http://${withPort}` : withPort
}

const LOOKS_LIKE_HOST =
  /^(localhost|\d{1,3}(\.\d{1,3}){3}|([a-z0-9-]+\.)+[a-z][a-z0-9-]+)(:\d+)?([/?#].*)?$/i

/**
 * What the address box makes of what was typed: the address itself, or a
 * search for the words. Null when there's nothing to go to.
 */
export const toAddress = (typed: string): string | null => {
  const text = typed.trim()
  if (!text) return null
  if (/^https?:\/\//i.test(text)) return isWebUrl(text) ? text : null
  // Another scheme, such as `file:` or `javascript:`, is searched for as
  // words rather than opened.
  if (!/\s/.test(text) && LOOKS_LIKE_HOST.test(text)) {
    const isLocal = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:|\/|$)/i.test(text)
    return `${isLocal ? 'http' : 'https'}://${text}`
  }
  return `${SEARCH_URL}${encodeURIComponent(text)}`
}

/**
 * The address AI asked for. It has to name a web page: no searching for
 * whatever it sent, and nothing but http and https.
 */
export const toAiAddress = (asked: string): string | null => {
  const text = asked.trim()
  if (!text || /\s/.test(text)) return null
  if (/^https?:\/\//i.test(text)) return isWebUrl(text) ? text : null
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !LOOKS_LIKE_HOST.test(text)) {
    return null
  }
  return LOOKS_LIKE_HOST.test(text) ? toAddress(text) : null
}

/**
 * The browser's user agent without the parts that name this app or Electron,
 * so sites treat it as the Chrome it is built on.
 */
export const browserUserAgent = (userAgent: string) =>
  userAgent
    .replace(
      /(\(KHTML, like Gecko\)) (.*?)(Chrome\/\S+)/,
      (_match, gecko: string, _extra: string, chrome: string) =>
        `${gecko} ${chrome}`
    )
    .replace(/ Electron\/\S+/, '')
