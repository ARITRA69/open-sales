import { z } from 'zod'

/*
 * GET /api/v1/health. The desktop app calls it to check a server address
 * before signing in, and Docker calls it to know the server is up.
 */
export const healthResponseSchema = z.object({
  // `degraded` means the API answered but can't reach its database.
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
  version: z.string()
})

export type THealthResponse = z.infer<typeof healthResponseSchema>
