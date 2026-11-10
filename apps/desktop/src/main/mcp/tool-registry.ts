import { z } from 'zod'

/*
 * The tools this app offers the person's own AI tool (Claude Code or Codex)
 * over MCP. Each part of the app registers its own: the browser's are the
 * first, and the sales-record tools join the same registry later.
 */

/** What a tool hands back: words, and sometimes a picture. */
export type TToolResult = {
  text: string
  image?: { data: string; mimeType: string }
}

/** Who is calling. */
export type TToolContext = {
  // The AI tool's name for people, such as "Claude Code".
  client: string
}

export type TTool<TInput extends z.ZodObject = z.ZodObject> = {
  // Letters, digits and underscores, such as `browser_open`.
  name: string
  title: string
  description: string
  input: TInput
  // It only looks; it changes nothing.
  readOnly?: boolean
  run: (input: z.infer<TInput>, context: TToolContext) => Promise<TToolResult>
}

/** Keeps a tool's input type tied to its schema. */
export const defineTool = <TInput extends z.ZodObject>(tool: TTool<TInput>) =>
  tool as unknown as TTool

/** A problem meant for the AI tool to read and act on, not a crash. */
export type TToolFailure = { isToolFailure: true; message: string }

/** The tools of one part of the app, such as the browser, named for people. */
export type TToolGroup = {
  // Such as "Browser".
  title: string
  // One line on what these tools are for.
  about: string
  // A page of the app that says more about them, such as `#/browser/connect`.
  more?: { label: string; href: string }
}

export const createToolRegistry = () => {
  const tools = new Map<string, TTool>()
  // Which group each tool was added under. None for a tool added by itself.
  const groupOf = new Map<string, TToolGroup>()

  const add = (...added: TTool[]) => {
    for (const tool of added) {
      if (tools.has(tool.name)) {
        throw new Error(`Two tools are called ${tool.name}`)
      }
      tools.set(tool.name, tool)
    }
  }

  return {
    add,

    /** Adds one part of the app's tools, which the app lists together. */
    addGroup: (group: TToolGroup, ...added: TTool[]) => {
      add(...added)
      for (const tool of added) groupOf.set(tool.name, group)
    },

    /**
     * The tools by group, in the order they were added, for the app's own
     * Connect AI page. `group` is null for tools added by themselves.
     */
    groups: () => {
      const byGroup = new Map<TToolGroup | null, TTool[]>()
      for (const tool of tools.values()) {
        const group = groupOf.get(tool.name) ?? null
        byGroup.set(group, [...(byGroup.get(group) ?? []), tool])
      }
      return [...byGroup].map(([group, grouped]) => ({
        group,
        tools: grouped
      }))
    },

    has: (name: string) => tools.has(name),

    /** The tools as MCP lists them. */
    list: () =>
      [...tools.values()].map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: z.toJSONSchema(tool.input) as Record<string, unknown>,
        annotations: {
          title: tool.title,
          readOnlyHint: tool.readOnly ?? false,
          // Nothing here deletes anything of the person's.
          destructiveHint: false,
          // A browser reaches the open web.
          openWorldHint: true
        }
      })),

    /**
     * Runs a tool. Bad input and things the tool refuses come back as a
     * result the AI can read (`isError`), never as a thrown error.
     */
    call: async (name: string, input: unknown, context: TToolContext) => {
      const tool = tools.get(name)
      if (!tool) return null

      const parsed = tool.input.safeParse(input ?? {})
      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `That isn’t what ${name} takes: ${z.prettifyError(parsed.error)}`
            }
          ],
          isError: true
        }
      }
      try {
        const result = await tool.run(parsed.data, context)
        return {
          content: [
            { type: 'text' as const, text: result.text },
            ...(result.image
              ? [{ type: 'image' as const, ...result.image }]
              : [])
          ],
          isError: false
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: error instanceof Error ? error.message : String(error)
            }
          ],
          isError: true
        }
      }
    }
  }
}

export type TToolRegistry = ReturnType<typeof createToolRegistry>
