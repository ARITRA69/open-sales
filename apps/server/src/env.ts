import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(8787)
})

export type TEnv = z.infer<typeof envSchema>

/** The server's settings, from the environment. Stops with a clear message if one is missing. */
export const readEnv = (source: Record<string, string | undefined>): TEnv => {
  const result = envSchema.safeParse(source)

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`The server's settings are incomplete:\n${problems}`)
  }

  return result.data
}
