import type { TAiToolStatus } from '../../../preload/bridge-types'

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
