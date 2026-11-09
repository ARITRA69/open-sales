import { describe, expect, it } from 'vitest'

import { summariseAiTools } from './ai-tool-summary'

const CLAUDE = { id: 'claude-code' as const, name: 'Claude Code' }
const CODEX = { id: 'codex' as const, name: 'Codex' }

describe('summariseAiTools', () => {
  it('says it is checking before the first answer', () => {
    expect(summariseAiTools(null).tone).toBe('faint')
  })

  it('names the first ready tool, even if another needs sign-in', () => {
    expect(
      summariseAiTools({
        tools: [
          { ...CLAUDE, state: 'needs-sign-in', version: null },
          { ...CODEX, state: 'ready', version: '0.1' }
        ]
      })
    ).toEqual({
      label: 'Codex ready',
      detail: 'Codex is ready',
      tone: 'success',
      // Both installed tools get a logo; the one that can't be used is faded.
      tools: [
        { id: 'claude-code', muted: true },
        { id: 'codex', muted: false }
      ]
    })
  })

  it('says AI ready, briefly, when both are ready', () => {
    const summary = summariseAiTools({
      tools: [
        { ...CLAUDE, state: 'ready', version: null },
        { ...CODEX, state: 'ready', version: null }
      ]
    })
    expect(summary.label).toBe('AI ready')
    expect(summary.detail).toBe('Claude Code and Codex are ready')
  })

  it('asks to sign in when nothing is ready', () => {
    expect(
      summariseAiTools({
        tools: [
          { ...CLAUDE, state: 'needs-sign-in', version: null },
          { ...CODEX, state: 'not-installed' }
        ]
      }).label
    ).toBe('Sign in to Claude Code')
  })

  it('says so when neither tool is installed', () => {
    expect(
      summariseAiTools({
        tools: [
          { ...CLAUDE, state: 'not-installed' },
          { ...CODEX, state: 'not-installed' }
        ]
      })
    ).toMatchObject({
      label: 'No AI tool found',
      tone: 'destructive',
      tools: []
    })
  })
})
