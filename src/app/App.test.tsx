import { forwardRef, useImperativeHandle } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { SessionStore } from '../features/session/sessionStore'
import type { YouTubePlayerHandle } from '../features/player/YouTubePlayer'
import type { AudioRecorderPort } from '../features/recorder/audioRecorder'
import { STANFORD_SPEECH } from '../data/stanfordSpeech'

function createRestoredStore(): SessionStore {
  let erased = false
  return {
    async load() {
      return erased
        ? { session: null, takes: [] }
        : {
            session: {
              speechId: 'steve-jobs-stanford-2005',
              activeLineId: 'line-002',
              completedLineIds: ['line-001'],
              updatedAt: '2026-09-16T00:00:00.000Z',
            },
            takes: [],
          }
    },
    async saveProgress() {},
    async replaceTake() {},
    async discard() {
      erased = true
    },
  }
}

describe('Quit & Erase', () => {
  it('keeps progress when canceled and resets after confirmation', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    render(<App store={createRestoredStore()} />)

    expect(await screen.findByText(`Line 2 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()

    confirm.mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: /quit & erase/i }))
    expect(screen.getByText(`Line 2 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()

    confirm.mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: /quit & erase/i }))
    expect(await screen.findByText(`Line 1 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()
  })
})

describe('guided practice loop', () => {
  it('plays one line, records a take, and enables Next', async () => {
    const user = userEvent.setup()
    const store = createRestoredStore()
    const recorder: AudioRecorderPort = {
      start() {},
      async stop() {
        return {
          blob: new Blob(['voice'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          durationMs: 900,
        }
      },
      release() {},
    }
    const FakePlayer = forwardRef<YouTubePlayerHandle, {
      onFinished: () => void
      onError: (message: string) => void
      videoId: string
    }>(function FakePlayer({ onFinished }, ref) {
      useImperativeHandle(ref, () => ({ playRange() {}, cue() {} }))
      return <button onClick={onFinished}>Finish source line</button>
    })

    render(
      <App
        store={store}
        playerComponent={FakePlayer}
        recorderFactory={async () => recorder}
      />,
    )

    await screen.findByText(`Line 2 of ${STANFORD_SPEECH.lines.length}`)
    await user.click(screen.getByRole('button', { name: /hear steve/i }))
    await user.click(screen.getByRole('button', { name: /finish source line/i }))
    await user.click(screen.getByRole('button', { name: /^record$/i }))
    await user.click(screen.getByRole('button', { name: /^stop$/i }))

    expect(screen.getByRole('button', { name: /^listen$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^redo$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled()
  })

  it('shows a microphone error instead of silently failing', async () => {
    const user = userEvent.setup()
    const FakePlayer = forwardRef<YouTubePlayerHandle, {
      onFinished: () => void
      onError: (message: string) => void
      videoId: string
    }>(function FakePlayer({ onFinished }, ref) {
      useImperativeHandle(ref, () => ({ playRange() {}, cue() {} }))
      return <button onClick={onFinished}>Finish source line</button>
    })
    render(<App store={createRestoredStore()} playerComponent={FakePlayer} recorderFactory={async () => { throw new Error('Microphone blocked.') }} />)
    await screen.findByText(`Line 2 of ${STANFORD_SPEECH.lines.length}`)
    await user.click(screen.getByRole('button', { name: /hear steve/i }))
    await user.click(screen.getByRole('button', { name: /finish source line/i }))
    await user.click(screen.getByRole('button', { name: /^record$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone blocked.')
  })
})
