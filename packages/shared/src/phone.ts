import type { CountryCode } from 'libphonenumber-js'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { z } from 'zod'

/*
 * Phone numbers are stored one way: E.164, like "+442079460000". The app
 * shows them as "+44 20 7946 0000".
 */

export type { CountryCode }

/**
 * What someone typed, as E.164, or null if it isn't a whole, real number.
 * Without a leading +, `country` says which country it's from.
 */
export const toE164 = (typed: string, country?: CountryCode): string | null => {
  const parsed = parsePhoneNumberFromString(typed, country)
  return parsed?.isValid() ? parsed.number : null
}

/** "+442079460000" → "+44 20 7946 0000". Anything else comes back as it is. */
export const formatPhone = (stored: string | null): string =>
  stored
    ? (parsePhoneNumberFromString(stored)?.formatInternational() ?? stored)
    : ''

/** An optional phone number: empty is null; anything else must be real. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((typed, context) => {
    if (!typed) return null
    const e164 = toE164(typed)
    if (!e164) {
      context.addIssue({
        code: 'custom',
        message: 'Enter a whole phone number, with its country code'
      })
      return z.NEVER
    }
    return e164
  })
  .nullable()
