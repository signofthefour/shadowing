import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Transcript } from './Transcript'
import type { TranscriptLine } from '../../domain/types'

const lines: TranscriptLine[] = [
  { id: 'line-001', sequence: 0, text: 'First line', startSeconds: 1, endSeconds: 2 },
  { id: 'line-002', sequence: 1, text: 'Current line', startSeconds: 2, endSeconds: 3 },
  { id: 'line-003', sequence: 2, text: 'Third line', startSeconds: 3, endSeconds: 4 },
]

describe('Transcript', () => {
  it('marks the active line and lets the learner select another', async () => {
    const onSelect = vi.fn()
    Element.prototype.scrollIntoView = vi.fn()
    render(<Transcript lines={lines} activeLineId="line-002" onSelect={onSelect} />)

    expect(screen.getByRole('button', { name: 'Current line' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Third line' }))
    expect(onSelect).toHaveBeenCalledWith('line-003')
  })
})
