import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(8787),
  // Where people reach this server. Defaults to localhost and PORT.
  PUBLIC_URL: z.url().optional(),
  // The desktop app's link scheme, for the join page's "Open the app".
  APP_URL_SCHEME: z
    .string()
    .regex(/^[a-z][a-z0-9+.-]*$/)
    .default('open-sales'),
  // Signs sessions. Leave unset and the server makes and keeps its own.
  AUTH_SECRET: z.string().min(32, 'Use at least 32 characters').optional()
})

export type TEnv = z.infer<typeof envSchema>

/** The server's settings, from the environment. Stops with a clear message if one is missing. */
export const readEnv = (source: Record<string, string | undefined>): TEnv => {
  // Docker Compose passes unset variables as empty strings; treat them as unset.
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== '')
  )
  const result = envSchema.safeParse(present)

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`The server's settings are incomplete:\n${problems}`)
  }

  return result.data
}
