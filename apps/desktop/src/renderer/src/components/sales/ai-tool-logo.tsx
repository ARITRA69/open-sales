import claudeCodeLogo from '@/assets/ai-tools/claude-code.png'
import codexLogo from '@/assets/ai-tools/codex.png'
import { cn } from '@/lib/utils'

import type { TAiToolId } from '../../../../preload/bridge-types'

const LOGOS: Record<TAiToolId, string> = {
  'claude-code': claudeCodeLogo,
  codex: codexLogo
}

type TAiToolLogoProps = {
  id: TAiToolId
  // Faded when the tool is installed but can't be used yet.
  muted?: boolean
  className?: string
}

/**
 * Claude Code's or Codex's logo on a small white disc, like an app icon.
 * Decorative: the text beside it names the tool and its state.
 */
export const AiToolLogo = ({
  id,
  muted = false,
  className
}: TAiToolLogoProps) => (
  <span
    className={cn(
      'flex size-5 flex-none items-center justify-center rounded-full bg-background shadow-(--shadow-tile)',
      className
    )}
    data-slot="ai-tool-logo"
  >
    <img
      alt=""
      className={cn('size-3 object-contain', muted && 'opacity-40 grayscale')}
      src={LOGOS[id]}
    />
  </span>
)
