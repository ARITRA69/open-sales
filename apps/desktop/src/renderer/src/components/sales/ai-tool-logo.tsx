import claudeCodeLogo from '@/assets/ai-tools/claude-code.png'
import codexLogo from '@/assets/ai-tools/codex.png'
import { Dot, type TDotTone } from '@/components/ui/status'
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

type TAiToolStackProps = {
  tools: { id: TAiToolId; muted?: boolean }[]
  // One dot for the whole stack: green when a tool is ready.
  tone: TDotTone
}

/** The installed tools' logos, overlapping, with one status dot. */
export const AiToolStack = ({ tools, tone }: TAiToolStackProps) => (
  <span className="relative flex flex-none items-center">
    {tools.map((tool, index) => (
      <AiToolLogo
        key={tool.id}
        className={index > 0 ? '-ml-1.5' : undefined}
        id={tool.id}
        muted={tool.muted}
      />
    ))}
    {/* The ring keeps the dot readable where it overlaps a logo. */}
    <span className="absolute -right-0.5 -bottom-0.5 flex rounded-full shadow-(--shadow-badge-ring)">
      <Dot size="sm" tone={tone} />
    </span>
  </span>
)
