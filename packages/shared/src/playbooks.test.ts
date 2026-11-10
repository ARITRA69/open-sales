import { describe, expect, it } from 'vitest'

import {
  buildPlaybookPrompt,
  fillPlaybookSteps,
  playbookCreateSchema,
  playbookUpdateSchema,
  STARTER_PLAYBOOKS
} from './playbooks'
import { canSeePlaybook, canWritePlaybooks } from './roles'

const PLAN = {
  name: 'Plan',
  question: 'Which plan did they pick?',
  options: ['Starter', 'Team']
}

describe('playbookCreateSchema', () => {
  it('takes a name alone, and tidies what’s typed', () => {
    expect(
      playbookCreateSchema.parse({ name: ' Demo follow-up ', description: ' ' })
    ).toEqual({ name: 'Demo follow-up', description: null })
  })

  it('lets a playbook change only fields, tasks and email drafts', () => {
    const parsed = playbookCreateSchema.parse({
      name: 'Demo follow-up',
      allowedChanges: ['email_drafts', 'fields', 'fields']
    })
    expect(parsed.allowedChanges).toEqual(['fields', 'email_drafts'])

    for (const forbidden of ['send_email', 'owners', 'owner', 'archive']) {
      const refused = playbookCreateSchema.safeParse({
        name: 'Demo follow-up',
        allowedChanges: ['fields', forbidden]
      })
      expect(refused.success).toBe(false)
      expect(refused.error?.issues[0].message).toMatch(/nothing else/)
    }
  })

  it('wants every blank named once, with a question', () => {
    expect(
      playbookCreateSchema.safeParse({ name: 'X', blanks: [PLAN] }).success
    ).toBe(true)
    expect(
      playbookCreateSchema.safeParse({
        name: 'X',
        blanks: [PLAN, { ...PLAN, name: 'plan ' }]
      }).error?.issues[0].message
    ).toMatch(/same name/)
    expect(
      playbookCreateSchema.safeParse({
        name: 'X',
        blanks: [{ ...PLAN, question: ' ' }]
      }).success
    ).toBe(false)
    expect(
      playbookCreateSchema.safeParse({
        name: 'X',
        blanks: [{ ...PLAN, name: '{Plan}' }]
      }).success
    ).toBe(false)
  })
})

describe('playbookUpdateSchema', () => {
  it('needs the version it was made against', () => {
    expect(playbookUpdateSchema.safeParse({ name: 'X' }).success).toBe(false)
    expect(
      playbookUpdateSchema.parse({ steps: ' Read it. ', version: 2 })
    ).toEqual({ steps: 'Read it.', version: 2 })
  })
})

describe('fillPlaybookSteps', () => {
  it('puts answers where the steps name the blank', () => {
    const filled = fillPlaybookSteps(
      'Quote the { plan } plan. Mention {Plan} twice. Leave {Other} alone.',
      [PLAN],
      { Plan: 'Team' }
    )
    expect(filled.text).toBe(
      'Quote the Team plan. Mention Team twice. Leave {Other} alone.'
    )
    expect(filled.unplaced).toEqual([])
  })

  it('hands back answers the steps don’t mention, and skips empty ones', () => {
    const tone = { name: 'Tone', question: 'How should it sound?', options: [] }
    const filled = fillPlaybookSteps(
      'Draft a recap in a {Tone} tone.',
      [PLAN, tone],
      {
        Plan: 'Team',
        Tone: '  '
      }
    )
    expect(filled.text).toBe('Draft a recap in a {Tone} tone.')
    expect(filled.unplaced).toEqual([
      { question: 'Which plan did they pick?', answer: 'Team' }
    ])
  })

  it('never fills an answer into another answer', () => {
    const second = { name: 'Other', question: 'Other?', options: [] }
    const filled = fillPlaybookSteps('{Plan} then {Other}', [PLAN, second], {
      Plan: '{Other}',
      Other: 'last'
    })
    expect(filled.text).toBe('{Other} then last')
  })
})

describe('buildPlaybookPrompt', () => {
  it('says what to do, on what, and what it may change', () => {
    const prompt = buildPlaybookPrompt(
      {
        name: 'Demo follow-up',
        steps: 'Draft a recap.',
        blanks: [PLAN],
        allowedChanges: ['fields', 'tasks', 'email_drafts']
      },
      { answers: { Plan: 'Team' }, targetLabel: 'Halden Capital' }
    )
    expect(prompt).toBe(
      [
        'Run the playbook “Demo follow-up” on Halden Capital.',
        'Steps:\nDraft a recap.',
        'Answers:\n- Which plan did they pick? Team',
        'You may propose changes to fields, tasks and email drafts, and nothing else. Every change is a proposal for a person to approve. Never send email or change who owns a record.'
      ].join('\n\n')
    )
  })

  it('tells a playbook with nothing allowed to only answer', () => {
    const prompt = buildPlaybookPrompt({
      name: 'Summary',
      steps: 'Sum it up.',
      blanks: [],
      allowedChanges: []
    })
    expect(prompt).toContain('Don’t propose any changes')
    expect(prompt).toContain('Never send email')
  })
})

describe('STARTER_PLAYBOOKS', () => {
  it('are four playbooks the server would accept as written', () => {
    expect(STARTER_PLAYBOOKS.map((starter) => starter.name)).toEqual([
      'Meeting prep',
      'Follow-up after a call',
      'Stalled deal check',
      'Renewal prep'
    ])
    for (const starter of STARTER_PLAYBOOKS) {
      expect(playbookCreateSchema.parse(starter)).toEqual(starter)
      // Every blank is used in the steps, and every {Name} is a blank.
      const named = [...starter.steps.matchAll(/\{([^{}]+)\}/g)].map(
        (match) => match[1]
      )
      expect([...new Set(named)].sort()).toEqual(
        starter.blanks.map((blank) => blank.name).sort()
      )
    }
  })
})

describe('playbook roles', () => {
  it('lets managers and admins write, and members only read', () => {
    expect(canWritePlaybooks('admin')).toBe(true)
    expect(canWritePlaybooks('manager')).toBe(true)
    expect(canWritePlaybooks('member')).toBe(false)
  })

  it('shows drafts to their author, managers and admins only', () => {
    const draft = { authorId: 'u1', isPublished: false }
    expect(canSeePlaybook('member', 'u2', draft)).toBe(false)
    expect(canSeePlaybook('member', 'u1', draft)).toBe(true)
    expect(canSeePlaybook('manager', 'u2', draft)).toBe(true)
    expect(
      canSeePlaybook('member', 'u2', { ...draft, isPublished: true })
    ).toBe(true)
    // A starter has no author.
    expect(
      canSeePlaybook('member', 'u2', { authorId: null, isPublished: false })
    ).toBe(false)
  })
})
