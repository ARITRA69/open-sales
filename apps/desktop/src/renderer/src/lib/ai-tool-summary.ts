import type { TDotTone } from '@/components/ui/status'

import type {
  TAiToolId,
  TAiToolsStatus,
  TAiToolStatus
} from '../../../preload/bridge-types'

/**
 * The sidebar footer: a short line that fits the sidebar, a longer one for
 * its tooltip, and the installed tools' logos (faded if not usable yet).
 */
export type TAiToolSummary = {
  label: string
  detail: string
  tone: TDotTone
  tools: { id: TAiToolId; muted: boolean }[]
}

/** Picks what to say: the ready tools, else what needs doing. */
export const summariseAiTools = (
  status: TAiToolsStatus | null
): TAiToolSummary => {
  if (!status) {
    const label = 'Checking for AI…'
    return { label, detail: label, tone: 'faint', tools: [] }
  }

  const tools = status.tools
    .filter((tool) => tool.state !== 'not-installed')
    .map((tool) => ({ id: tool.id, muted: tool.state !== 'ready' }))

  const ready = status.tools.filter((tool) => tool.state === 'ready')
  if (ready.length > 1) {
    const names = ready.map((tool) => tool.name).join(' and ')
    return {
      label: 'AI ready',
      detail: `${names} are ready`,
      tone: 'success',
      tools
    }
  }
  if (ready.length === 1) {
    return {
      label: `${ready[0].name} ready`,
      detail: `${ready[0].name} is ready`,
      tone: 'success',
      tools
    }
  }

  const unsigned = status.tools.find((tool) => tool.state === 'needs-sign-in')
  if (unsigned) {
    const label = `Sign in to ${unsigned.name}`
    return { label, detail: label, tone: 'accent', tools }
  }

  return {
    label: 'No AI tool found',
    detail: 'Install Claude Code or Codex. See Settings.',
    tone: 'destructive',
    tools
  }
}

const INSTALL_COMMANDS: Record<TAiToolStatus['id'], string> = {
  'claude-code': 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex'
}

const SIGN_IN_COMMANDS: Record<TAiToolStatus['id'], string> = {
  'claude-code': 'claude',
  codex: 'codex login'
}

/** What Settings says about one tool, and how to fix it. */
export const describeAiTool = (tool: TAiToolStatus) => {
  switch (tool.state) {
    case 'ready':
      return {
        status: tool.version ? `Ready · ${tool.version}` : 'Ready',
        tone: 'success' as const,
        fix: null
      }
    case 'needs-sign-in':
      return {
        status: 'Installed, not signed in',
        tone: 'accent' as const,
        fix: {
          text: 'To sign in, run in a terminal:',
          command: SIGN_IN_COMMANDS[tool.id]
        }
      }
    case 'not-installed':
      return {
        status: 'Not installed',
        tone: 'faint' as const,
        fix: {
          text: 'To install, run in a terminal:',
          command: INSTALL_COMMANDS[tool.id]
        }
      }
  }
}
