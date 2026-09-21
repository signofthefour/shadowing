import { forwardRef, useImperativeHandle } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
  it('serializes pending Next saves so duplicate clicks advance only once', async () => {
    let resolveSave!: () => void
    const pendingSave = new Promise<void>((resolve) => { resolveSave = resolve })
    const saveProgress = vi.fn(() => pendingSave)
    const store: SessionStore = {
      async load() {
        return {
          session: {
            speechId: 'steve-jobs-stanford-2005',
            activeLineId: 'line-143',
            completedLineIds: [],
            updatedAt: '2026-09-21T00:00:00.000Z',
          },
          takes: [],
        }
      },
      saveProgress,
      async replaceTake() {},
      async discard() {},
    }
    render(<App store={store} />)

    await screen.findByText(`Line 143 of ${STANFORD_SPEECH.lines.length}`)
    const next = screen.getByRole('button', { name: /^next$/i })
    fireEvent.click(next)
    fireEvent.click(next)

    expect(saveProgress).toHaveBeenCalledOnce()
    expect(next).toBeDisabled()

    await act(async () => resolveSave())

    expect(await screen.findByText(`Line 144 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /practice complete/i })).not.toBeInTheDocument()
  })

  it('keeps an incomplete final line open with missing transcript lines selectable', async () => {
    const user = userEvent.setup()
    const saveProgress = vi.fn()
    const store: SessionStore = {
      async load() {
        return {
          session: {
            speechId: 'steve-jobs-stanford-2005',
            activeLineId: 'line-144',
            completedLineIds: [],
            updatedAt: '2026-09-21T00:00:00.000Z',
          },
          takes: [],
        }
      },
      saveProgress,
      async replaceTake() {},
      async discard() {},
    }
    render(<App store={store} />)

    await screen.findByText(`Line 144 of ${STANFORD_SPEECH.lines.length}`)
    await user.click(screen.getByRole('button', { name: /^next$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Some lines are still unrecorded')
    expect(screen.getByText(`Line 144 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: STANFORD_SPEECH.lines[0].text })).toBeEnabled()
    expect(saveProgress).not.toHaveBeenCalled()
  })

  it('advances to the next line without requiring a recording', async () => {
    const user = userEvent.setup()
    render(<App store={createRestoredStore()} />)

    await screen.findByText(`Line 2 of ${STANFORD_SPEECH.lines.length}`)
    const next = screen.getByRole('button', { name: /^next$/i })
    expect(next).toBeEnabled()

    await user.click(next)

    expect(await screen.findByText(`Line 3 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()
  })

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
