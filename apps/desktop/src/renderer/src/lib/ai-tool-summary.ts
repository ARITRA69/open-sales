import type { TDotTone } from '@/components/ui/status'

import type {
  TAiToolsStatus,
  TAiToolStatus
} from '../../../preload/bridge-types'

/** One line for the sidebar footer: the tool the AI help will use. */
export type TAiToolSummary = { label: string; tone: TDotTone }

/** Picks what to say: the first ready tool, else what needs doing. */
export const summariseAiTools = (
  status: TAiToolsStatus | null
): TAiToolSummary => {
  if (!status) return { label: 'Checking for your AI tool…', tone: 'faint' }

  const ready = status.tools.find((tool) => tool.state === 'ready')
  if (ready) return { label: `${ready.name} is ready`, tone: 'success' }

  const unsigned = status.tools.find((tool) => tool.state === 'needs-sign-in')
  if (unsigned) return { label: `Sign in to ${unsigned.name}`, tone: 'accent' }

  return { label: 'No AI tool found', tone: 'destructive' }
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
