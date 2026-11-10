/*
 * Fields AI never types into: passwords, one-time codes and payment details.
 * The person signs in and pays; AI doesn't. The facts come from the page's
 * own markup, read from outside the page so its scripts can't lie about them.
 */

/** What is known about one form field. */
export type TFieldFacts = {
  // The element's name in lower case, such as `input`.
  tag: string
  type?: string | null
  autocomplete?: string | null
  name?: string | null
  id?: string | null
  // What the page calls it: its label or placeholder.
  label?: string | null
  // Inside a frame from another site, where nothing can be checked.
  inOtherSiteFrame?: boolean
}

export type TProtectedKind = 'password' | 'payment' | 'other-site-frame'

const PASSWORD_AUTOCOMPLETE = [
  'current-password',
  'new-password',
  'one-time-code'
]

const PAYMENT_WORDS =
  /card.?(number|no|num|holder|code|cvc|cvv)|cc.?(num|number|exp|csc|cvc|cvv|name)|\b(cvc|cvv|cvn|csc)\b|security.?code|exp(iry|iration)?.?(date|month|year|mm|yy)|\biban\b|account.?number|routing.?number|sort.?code/i

const PASSWORD_WORDS =
  /pass.?word|passcode|\bpin\b|one.?time.?(code|pass)|\botp\b/i

const tokensOf = (autocomplete: string | null | undefined) =>
  (autocomplete ?? '').toLowerCase().split(/\s+/).filter(Boolean)

/** Why AI may not type here, or null when it may. */
export const protectedKind = (facts: TFieldFacts): TProtectedKind | null => {
  if (facts.inOtherSiteFrame) return 'other-site-frame'

  const type = (facts.type ?? '').toLowerCase()
  const autocomplete = tokensOf(facts.autocomplete)
  if (type === 'password') return 'password'
  if (autocomplete.some((token) => PASSWORD_AUTOCOMPLETE.includes(token))) {
    return 'password'
  }
  if (autocomplete.some((token) => token.startsWith('cc-'))) return 'payment'

  // Names are the page's own words, so they only ever add protection.
  const words = [facts.name, facts.id, facts.label].filter(Boolean).join(' ')
  if (PAYMENT_WORDS.test(words)) return 'payment'
  if (PASSWORD_WORDS.test(words)) return 'password'
  return null
}

const REASONS: Record<TProtectedKind, string> = {
  password:
    'AI never types passwords or sign-in codes. Ask the person to fill this in themselves.',
  payment:
    'AI never types payment details. Ask the person to fill this in themselves.',
  'other-site-frame':
    'This field is inside a frame from another site (often a payment or sign-in form), so AI can’t type in it. Ask the person to fill it in themselves.'
}

export const protectedReason = (kind: TProtectedKind) => REASONS[kind]

/**
 * Whether a form holds a field AI may not fill. AI doesn't send such a form
 * either (no clicking its button, no Enter): the person signs in and pays.
 */
export const formIsProtected = (fields: TFieldFacts[]) =>
  fields.some((field) => {
    const kind = protectedKind(field)
    return kind === 'password' || kind === 'payment'
  })

export const PROTECTED_FORM_REASON =
  'This form has a password or payment field, so AI can’t send it. Ask the person to press the button themselves.'

/** Reads the flat `[name, value, name, value…]` list the browser reports. */
export const attributesOf = (flat: string[] | undefined) => {
  const attributes: Record<string, string> = {}
  for (let index = 0; index + 1 < (flat?.length ?? 0); index += 2) {
    attributes[flat![index].toLowerCase()] = flat![index + 1]
  }
  return attributes
}
