import { forwardRef, useImperativeHandle } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import type { SessionStore } from '../features/session/sessionStore'
import type { YouTubePlayerHandle } from '../features/player/YouTubePlayer'
import type { Speech } from '../domain/types'

const speeches: Speech[] = [
  {
    id: 'speech-a',
    title: 'Speech A',
    videoId: 'videoA',
    lines: [
      { id: 'line-001', sequence: 0, text: 'One.', startSeconds: 0, endSeconds: 1 },
    ],
  },
  {
    id: 'speech-b',
    title: 'Speech B',
    videoId: 'videoB',
    lines: [
      { id: 'line-001', sequence: 0, text: 'Uno.', startSeconds: 0, endSeconds: 1 },
    ],
  },
]

function createStore(): SessionStore {
  return {
    async load() {
      return { session: null, takes: [] }
    },
    async getProgress() {
      return { completedCount: 0, activeLineId: null }
    },
    async saveProgress() {},
    async replaceTake() {},
    async discard() {},
  }
}

const FakePlayer = forwardRef<YouTubePlayerHandle, {
  onFinished: () => void
  onError: (message: string) => void
  videoId: string
}>(function FakePlayer(_props, ref) {
  useImperativeHandle(ref, () => ({ playRange() {}, cue() {} }))
  return <div />
})

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows the library first, then the chosen speech, then returns to the library', async () => {
    const user = userEvent.setup()
    render(<App speeches={speeches} store={createStore()} playerComponent={FakePlayer} />)

    expect(await screen.findByRole('button', { name: /Speech B/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Speech B/ }))
    expect(await screen.findByText('Line 1 of 1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /library/i }))
    expect(await screen.findByRole('button', { name: /Speech B/ })).toBeInTheDocument()
  })

  it('remembers the last-opened speech across remounts', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App speeches={speeches} store={createStore()} playerComponent={FakePlayer} />)

    await user.click(await screen.findByRole('button', { name: /Speech A/ }))
    await screen.findByText('Line 1 of 1')
    unmount()

    render(<App speeches={speeches} store={createStore()} playerComponent={FakePlayer} />)
    expect(await screen.findByText('Line 1 of 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Speech A/ })).not.toBeInTheDocument()
  })
})
