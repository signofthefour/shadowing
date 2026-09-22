import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Library } from './Library'
import type { SessionStore } from '../session/sessionStore'
import type { Speech } from '../../domain/types'

const speeches: Speech[] = [
  {
    id: 'speech-a',
    title: 'Speech A',
    videoId: 'videoA',
    lines: [
      { id: 'line-001', sequence: 0, text: 'One.', startSeconds: 0, endSeconds: 1 },
      { id: 'line-002', sequence: 1, text: 'Two.', startSeconds: 1, endSeconds: 2 },
    ],
  },
  {
    id: 'speech-b',
    title: 'Speech B',
    videoId: 'videoB',
    lines: [
      { id: 'line-001', sequence: 0, text: 'One.', startSeconds: 0, endSeconds: 1 },
    ],
  },
]

function createStore(progress: Record<string, number>): SessionStore {
  return {
    async load() {
      return { session: null, takes: [] }
    },
    async getProgress(speechId) {
      return { completedCount: progress[speechId] ?? 0, activeLineId: null }
    },
    async saveProgress() {},
    async replaceTake() {},
    async discard() {},
  }
}

describe('Library', () => {
  it('shows every speech with its progress', async () => {
    render(<Library speeches={speeches} store={createStore({ 'speech-a': 1 })} onSelect={() => {}} />)

    expect(await screen.findByText('1/2 recorded')).toBeInTheDocument()
    expect(await screen.findByText('Not started')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Speech A/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Speech B/ })).toBeInTheDocument()
  })

  it('selects a speech by id when its card is chosen', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Library speeches={speeches} store={createStore({})} onSelect={onSelect} />)

    await user.click(await screen.findByRole('button', { name: /Speech B/ }))

    expect(onSelect).toHaveBeenCalledWith('speech-b')
  })
})
