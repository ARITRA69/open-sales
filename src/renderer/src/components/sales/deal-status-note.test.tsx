// @vitest-environment jsdom
import { useState } from 'react'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TDealStatus } from './deal-status-config'
import { DealStatusNote } from './deal-status-note'

const makeFile = (name: string, size = 1000) => {
  const statusFile = new File(['x'], name)
  Object.defineProperty(statusFile, 'size', { value: size })
  return statusFile
}

const NoteHarness = ({ initialDraft }: { initialDraft: TDealStatus }) => {
  const [draft, setDraft] = useState(initialDraft)

  return (
    <DealStatusNote
      account="Lumen Retail"
      draft={draft}
      stage="Demo booked"
      onCancel={vi.fn()}
      onDraftChange={setDraft}
      onSave={vi.fn()}
    />
  )
}

const addFiles = (statusFiles: File[]) =>
  fireEvent.change(screen.getByLabelText('Add files'), {
    target: { files: statusFiles }
  })

describe('DealStatusNote', () => {
  afterEach(cleanup)

  it('asks the question that fits the status', () => {
    render(
      <NoteHarness
        initialDraft={{ status: 'Cancelled', note: '', files: [] }}
      />
    )

    expect(screen.getByPlaceholderText('Why was it cancelled?')).toBeTruthy()
    expect(screen.getByText('Lumen Retail · Demo booked')).toBeTruthy()
  })

  it('holds 5 files, and says how many it left out', () => {
    render(
      <NoteHarness initialDraft={{ status: 'Done', note: '', files: [] }} />
    )

    addFiles(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => makeFile(`${name}.pdf`))
    )

    expect(screen.getByText('5 of 5')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      '2 files were not added'
    )
    expect(
      (
        screen.getByRole('button', {
          name: /5 files added/
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
  })

  it('ignores a file it already has', () => {
    render(
      <NoteHarness
        initialDraft={{
          status: 'Done',
          note: '',
          files: [{ name: 'a.pdf', bytes: 1000 }]
        }}
      />
    )

    addFiles([makeFile('a.pdf', 1000)])

    expect(screen.getByText('1 of 5')).toBeTruthy()
  })

  it('removes a file and clears the warning', () => {
    render(
      <NoteHarness
        initialDraft={{
          status: 'Done',
          note: '',
          files: [{ name: 'a.pdf', bytes: 1000 }]
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove a.pdf' }))

    expect(screen.getByText('0 of 5')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
