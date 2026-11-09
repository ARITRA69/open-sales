import type { z } from 'zod'

/**
 * Checks form values against a shared schema. Returns the parsed values, or
 * the first message for each field that's wrong, keyed by field name.
 */
export const checkFields = <TSchema extends z.ZodType>(
  schema: TSchema,
  values: unknown
):
  | { ok: true; data: z.infer<TSchema> }
  | { ok: false; errors: Record<string, string> } => {
  const result = schema.safeParse(values)
  if (result.success) return { ok: true, data: result.data }

  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '')
    errors[field] ??= issue.message
  }
  return { ok: false, errors }
}
