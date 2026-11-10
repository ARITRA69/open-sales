import { describe, expect, it } from 'vitest'

import { canAddToTimeline, canEditActivity, canEditTask } from './roles'
import {
  activityCreateSchema,
  taskCreateSchema,
  taskListQuerySchema
} from './timeline'

const on = { type: 'company' as const, id: 'c1' }

describe('activityCreateSchema', () => {
  it('needs words in a note, and trims them', () => {
    expect(
      activityCreateSchema.safeParse({ type: 'note', on, body: '   ' }).success
    ).toBe(false)
    expect(
      activityCreateSchema.parse({ type: 'note', on, body: ' Hello ' })
    ).toMatchObject({ body: 'Hello' })
  })

  it('fills in a call: it connected, with nobody named and no notes', () => {
    expect(activityCreateSchema.parse({ type: 'call', on })).toMatchObject({
      outcome: 'connected',
      personIds: []
    })
    expect(
      activityCreateSchema.parse({ type: 'call', on, body: '' })
    ).toMatchObject({ body: null })
  })

  it('refuses a time that isn’t one, and a kind people can’t log', () => {
    expect(
      activityCreateSchema.safeParse({
        type: 'call',
        on,
        occurredAt: 'yesterday'
      }).success
    ).toBe(false)
    expect(
      activityCreateSchema.safeParse({ type: 'email', on, body: 'x' }).success
    ).toBe(false)
  })
})

describe('taskCreateSchema', () => {
  it('needs a title and takes a plain day', () => {
    expect(taskCreateSchema.safeParse({ title: ' ' }).success).toBe(false)
    expect(
      taskCreateSchema.safeParse({ title: 'Call', dueOn: '30/11/2026' }).success
    ).toBe(false)
    expect(
      taskCreateSchema.parse({ title: ' Call back ', dueOn: '2026-11-30', on })
    ).toMatchObject({ title: 'Call back', dueOn: '2026-11-30' })
  })
})

describe('taskListQuerySchema', () => {
  it('defaults to my open tasks', () => {
    expect(taskListQuerySchema.parse({})).toEqual({
      assignee: 'me',
      due: 'any',
      status: 'open',
      limit: 50
    })
  })
})

describe('timeline roles', () => {
  it('lets everyone add to a timeline', () => {
    expect(canAddToTimeline('member')).toBe(true)
  })

  it('lets a member change only the notes they wrote', () => {
    expect(canEditActivity('member', 'u1', 'u1')).toBe(true)
    expect(canEditActivity('member', 'u1', 'u2')).toBe(false)
    expect(canEditActivity('member', 'u1', null)).toBe(false)
    expect(canEditActivity('manager', 'u1', 'u2')).toBe(true)
  })

  it('lets a member change tasks they have or made', () => {
    const task = { assigneeId: 'u1', createdById: 'u2' }
    expect(canEditTask('member', 'u1', task)).toBe(true)
    expect(canEditTask('member', 'u2', task)).toBe(true)
    expect(canEditTask('member', 'u3', task)).toBe(false)
    expect(canEditTask('admin', 'u3', task)).toBe(true)
  })
})
