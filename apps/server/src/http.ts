import type { TApiError, TSessionUser } from '@open-sales/shared'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { z } from 'zod'

/** What routes behind sign-in can read: the signed-in person. */
export type TEnv = { Variables: { me: TSessionUser } }

export const sendError = (
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string
) => c.json<TApiError>({ error: { code, message } }, status)

const firstProblem = (error: z.ZodError) => error.issues[0].message

/** Reads and checks a JSON body; on failure, answers 400 with the first problem. */
export const readBody = async <TSchema extends z.ZodType>(
  c: Context,
  schema: TSchema
): Promise<
  { ok: true; data: z.infer<TSchema> } | { ok: false; response: Response }
> => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null))
  if (parsed.success) return { ok: true, data: parsed.data }
  return {
    ok: false,
    response: sendError(c, 400, 'invalid_request', firstProblem(parsed.error))
  }
}

/** Reads and checks the query string, like readBody. */
export const readQuery = <TSchema extends z.ZodType>(
  c: Context,
  schema: TSchema
): { ok: true; data: z.infer<TSchema> } | { ok: false; response: Response } => {
  const parsed = schema.safeParse(c.req.query())
  if (parsed.success) return { ok: true, data: parsed.data }
  return {
    ok: false,
    response: sendError(c, 400, 'invalid_request', firstProblem(parsed.error))
  }
}
