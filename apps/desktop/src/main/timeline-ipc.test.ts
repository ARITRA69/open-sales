import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TIMELINE_CHANNELS } from '../preload/bridge-types'
import type { TConnection } from './connection'
import { registerTimelineIpc } from './timeline-ipc'

type THandler = (event: unknown, ...args: unknown[]) => unknown

const handlers = vi.hoisted(() => new Map<string, THandler>())

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: THandler) =>
      handlers.set(channel, handler)
  }
}))

const TASK = {
  id: 't1',
  title: 'Send pricing',
  notes: null,
  dueOn: '2026-11-10',
  assignee: { id: 'u1', name: 'Asha Menon' },
  createdBy: { id: 'u1', name: 'Asha Menon' },
  company: null,
  deal: null,
  person: null,
  completedAt: null,
  source: 'manual',
  version: 1,
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z',
  archivedAt: null,
  canEdit: true
}

describe('timeline IPC', () => {
  const request = vi.fn<TConnection['request']>()
  const invoke = (channel: string, ...args: unknown[]) =>
    handlers.get(channel)?.({}, ...args)

  beforeEach(() => {
    handlers.clear()
    request.mockReset()
    registerTimelineIpc({ request } as unknown as TConnection)
  })

  it('reads a record’s timeline from that record’s page on the server', async () => {
    request.mockResolvedValue({
      ok: true,
      data: { items: [], nextCursor: null }
    })

    const answer = await invoke(
      TIMELINE_CHANNELS.read,
      { type: 'company', id: 'c 1' },
      { cursor: 'abc' }
    )

    expect(request).toHaveBeenCalledWith(
      '/companies/c%201/timeline?cursor=abc&limit=30',
      undefined
    )
    expect(answer).toEqual({ ok: true, data: { items: [], nextCursor: null } })
  })

  it('asks for the tasks due today', async () => {
    request.mockResolvedValue({
      ok: true,
      data: { items: [TASK], nextCursor: null }
    })

    const answer = await invoke(TIMELINE_CHANNELS.listTasks, { due: 'today' })

    expect(request).toHaveBeenCalledWith(
      '/tasks?assignee=me&due=today&status=open&limit=50',
      undefined
    )
    expect(answer).toMatchObject({ ok: true, data: { items: [{ id: 't1' }] } })
  })

  it('ticks a task off, or reopens it, against the version seen', async () => {
    request.mockResolvedValue({ ok: true, data: TASK })

    await invoke(TIMELINE_CHANNELS.setTaskDone, 't1', true, 4)
    await invoke(TIMELINE_CHANNELS.setTaskDone, 't1', false, 5)

    expect(request).toHaveBeenNthCalledWith(1, '/tasks/t1/complete', {
      method: 'POST',
      body: JSON.stringify({ version: 4 })
    })
    expect(request).toHaveBeenNthCalledWith(2, '/tasks/t1/reopen', {
      method: 'POST',
      body: JSON.stringify({ version: 5 })
    })
  })

  it('checks what the renderer sends before calling the server', async () => {
    expect(
      await invoke(TIMELINE_CHANNELS.read, { type: 'lead', id: 'x' })
    ).toMatchObject({ ok: false })
    expect(
      await invoke(TIMELINE_CHANNELS.createActivity, {
        type: 'note',
        on: { type: 'company', id: 'c1' },
        body: '   '
      })
    ).toEqual({ ok: false, message: 'Write the note first' })
    expect(
      await invoke(TIMELINE_CHANNELS.setTaskDone, 't1', 'yes', 1)
    ).toMatchObject({ ok: false })
    expect(request).not.toHaveBeenCalled()
  })

  it('passes on the server’s refusal, with its code', async () => {
    request.mockResolvedValue({
      ok: false,
      message: 'Someone changed this.',
      code: 'changed_since'
    })

    expect(await invoke(TIMELINE_CHANNELS.archiveTask, 't1', 1)).toEqual({
      ok: false,
      message: 'Someone changed this.',
      code: 'changed_since'
    })
  })

  it('refuses an answer that isn’t what the server should send', async () => {
    request.mockResolvedValue({ ok: true, data: { nope: true } })

    expect(
      await invoke(TIMELINE_CHANNELS.createTask, { title: 'Call back' })
    ).toMatchObject({ ok: false })
  })

  it('hands back just the people of a record', async () => {
    request.mockResolvedValue({ ok: true, data: { people: [] } })

    expect(
      await invoke(TIMELINE_CHANNELS.listPeople, { type: 'deal', id: 'd1' })
    ).toEqual({ ok: true, data: [] })
    expect(request).toHaveBeenCalledWith('/deals/d1/people', undefined)
  })
})
