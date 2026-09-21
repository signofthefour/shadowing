import {
  type ComponentType,
  type RefAttributes,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { STANFORD_SPEECH } from '../data/stanfordSpeech'
import { transition } from '../domain/practiceMachine'
import type { PracticeState, StoredTake } from '../domain/types'
import { exportSessionMp3 } from '../features/export/mp3Exporter'
import { createAudioRecorder, type AudioRecorderPort } from '../features/recorder/audioRecorder'
import { YouTubePlayer, type YouTubePlayerHandle } from '../features/player/YouTubePlayer'
import { createSessionStore, type SessionStore } from '../features/session/sessionStore'
import { Transcript } from '../features/transcript/Transcript'
import './App.css'

type PlayerProps = {
  videoId: string
  onFinished: () => void
  onError: (message: string) => void
  onReady?: () => void
}

type AppProps = {
  store?: SessionStore
  playerComponent?: ComponentType<PlayerProps & RefAttributes<YouTubePlayerHandle>>
  recorderFactory?: () => Promise<AudioRecorderPort>
}

const initialState: PracticeState = {
  phase: 'ready',
  activeIndex: 0,
  lineCount: STANFORD_SPEECH.lines.length,
  hasTake: false,
  error: null,
}

function recordingFailureMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return 'Browser storage is full. Clear some space and record again.'
  }
  return error instanceof Error ? error.message : 'The recording could not be saved.'
}

export function App({
  store: suppliedStore,
  playerComponent: PlayerComponent = YouTubePlayer,
  recorderFactory = createAudioRecorder,
}: AppProps) {
  const store = useMemo(() => suppliedStore ?? createSessionStore(), [suppliedStore])
  const [state, dispatch] = useReducer(transition, initialState)
  const [takes, setTakes] = useState<Map<string, StoredTake>>(new Map())
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canRetryVideo, setCanRetryVideo] = useState(false)
  const [playerReady, setPlayerReady] = useState(PlayerComponent !== YouTubePlayer)
  const [playerAttempt, setPlayerAttempt] = useState(0)
  const playerRef = useRef<YouTubePlayerHandle>(null)
  const recorderRef = useRef<AudioRecorderPort | null>(null)
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const showError = useCallback((message: string) => {
    setCanRetryVideo(false)
    dispatch({ type: 'EXTERNAL_ERROR', message })
  }, [])
  const showVideoError = useCallback((message: string) => {
    setCanRetryVideo(true)
    dispatch({ type: 'EXTERNAL_ERROR', message })
  }, [])
  const handlePlayerReady = useCallback(() => setPlayerReady(true), [])

  useEffect(() => {
    let current = true
    store.load(STANFORD_SPEECH.id).then(({ session, takes: restoredTakes }) => {
      if (!current) return
      const restoredIndex = session
        ? STANFORD_SPEECH.lines.findIndex((line) => line.id === session.activeLineId)
        : 0
      const index = restoredIndex >= 0 ? restoredIndex : 0
      const restoredMap = new Map(restoredTakes.map((take) => [take.lineId, take]))
      setTakes(restoredMap)
      dispatch({
        type: 'SELECT_LINE',
        index,
        hasTake: restoredMap.has(STANFORD_SPEECH.lines[index].id),
      })
      setReady(true)
    }).catch(() => {
      if (!current) return
      showError('Your saved session could not be opened. Reload to try again.')
      setReady(true)
    })
    return () => {
      current = false
      recorderRef.current?.release()
      previewRef.current?.pause()
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [store, showError])

  const activeLine = STANFORD_SPEECH.lines[state.activeIndex]
  const handleSourceFinished = useCallback(() => dispatch({ type: 'SOURCE_FINISHED' }), [])

  function hearSource() {
    if (!playerReady) return
    dispatch({ type: 'HEAR_SOURCE' })
    playerRef.current?.playRange(activeLine.startSeconds, activeLine.endSeconds)
  }

  async function startRecording() {
    if (busy || recorderRef.current) return
    setBusy(true)
    try {
      const recorder = await recorderFactory()
      recorder.start()
      recorderRef.current = recorder
      dispatch({ type: 'START_RECORDING' })
    } catch (error) {
      showError(error instanceof Error ? error.message : 'The microphone could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current
    if (!recorder) return
    setBusy(true)
    try {
      const audio = await recorder.stop()
      const take: StoredTake = {
        lineId: activeLine.id,
        ...audio,
        recordedAt: new Date().toISOString(),
      }
      await store.replaceTake(STANFORD_SPEECH.id, take)
      setTakes((previous) => new Map(previous).set(take.lineId, take))
      dispatch({ type: 'RECORDING_SAVED' })
    } catch (error) {
      setCanRetryVideo(false)
      dispatch({
        type: 'RECORDING_FAILED',
        message: recordingFailureMessage(error),
      })
    } finally {
      recorder.release()
      recorderRef.current = null
      setBusy(false)
    }
  }

  function listenToTake() {
    const take = takes.get(activeLine.id)
    if (!take) return
    previewRef.current?.pause()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(take.blob)
    previewUrlRef.current = url
    const audio = new Audio(url)
    previewRef.current = audio
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url)
      if (previewUrlRef.current === url) previewUrlRef.current = null
    }, { once: true })
    audio.play().catch(() => showError('The recording could not be played.'))
  }

  async function advance() {
    if (!takes.has(activeLine.id)) return
    if (state.activeIndex === STANFORD_SPEECH.lines.length - 1) {
      const missing = STANFORD_SPEECH.lines.find((line) => !takes.has(line.id))
      if (missing) {
        showError('Some lines are still unrecorded. Select a missing line to finish the speech.')
        return
      }
    }
    const nextIndex = Math.min(state.activeIndex + 1, STANFORD_SPEECH.lines.length - 1)
    try {
      await store.saveProgress({
      speechId: STANFORD_SPEECH.id,
      activeLineId: STANFORD_SPEECH.lines[nextIndex].id,
      completedLineIds: Array.from(takes.keys()),
      updatedAt: new Date().toISOString(),
      })
      dispatch({ type: 'NEXT' })
    } catch {
      showError('Progress could not be saved. Free browser storage and try again.')
    }
  }

  async function selectLine(lineId: string) {
    if (busy || state.phase === 'recording') return
    const index = STANFORD_SPEECH.lines.findIndex((line) => line.id === lineId)
    if (index < 0) return
    try {
      await store.saveProgress({
        speechId: STANFORD_SPEECH.id,
        activeLineId: lineId,
        completedLineIds: Array.from(takes.keys()),
        updatedAt: new Date().toISOString(),
      })
    } catch {
      showError('Position could not be saved. Free browser storage and try again.')
      return
    }
    playerRef.current?.cue(STANFORD_SPEECH.lines[index].startSeconds)
    dispatch({ type: 'SELECT_LINE', index, hasTake: takes.has(lineId) })
  }

  async function quitAndErase() {
    if (!window.confirm('Delete all recordings and progress?')) return
    setBusy(true)
    try {
      recorderRef.current?.release()
      recorderRef.current = null
      previewRef.current?.pause()
      await store.discard(STANFORD_SPEECH.id)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
      previewRef.current = null
      setTakes(new Map())
      dispatch({ type: 'SELECT_LINE', index: 0, hasTake: false })
    } catch {
      showError('The session could not be erased. Try again before closing this page.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadMp3() {
    setBusy(true)
    try {
      const blob = await exportSessionMp3({
        takes: Array.from(takes.values()),
        lineOrder: STANFORD_SPEECH.lines.map((line) => line.id),
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'steve-jobs-shadowing-session.mp3'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'The MP3 could not be created.')
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <main className="loading">Opening your practice session…</main>

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Speak Along home">Speak Along</a>
        <div className="session-meta">
          <span>{takes.size} recorded</span>
          <button className="quiet-button" type="button" onClick={quitAndErase} disabled={busy}>
            Quit &amp; Erase
          </button>
        </div>
      </header>

      <main className="practice-layout">
        <section className="video-card" aria-label="Speech video">
          <PlayerComponent key={playerAttempt} ref={playerRef} videoId={STANFORD_SPEECH.videoId} onFinished={handleSourceFinished} onError={showVideoError} onReady={handlePlayerReady} />
        </section>

        <section className="transcript-card" aria-label="Timed transcript">
          <Transcript lines={STANFORD_SPEECH.lines} activeLineId={activeLine.id} onSelect={selectLine} disabled={busy || state.phase === 'recording' || state.phase === 'playing-source'} />
          <p className="progress">Line {state.activeIndex + 1} of {STANFORD_SPEECH.lines.length}</p>
        </section>
      </main>

      {state.phase === 'completed' ? (
        <section className="finish-card" aria-label="Practice complete">
          <p className="eyebrow">Speech complete</p>
          <h1>Your voice made it to the end.</h1>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={downloadMp3} disabled={busy}>{busy ? 'Creating MP3…' : 'Download MP3'}</button>
            <button className="quiet-button" type="button" onClick={quitAndErase} disabled={busy}>Discard session</button>
          </div>
        </section>
      ) : (
        <section className="control-dock" aria-label="Practice controls">
          <div className="phase-copy" aria-live="polite">
            <span className="eyebrow">Your turn</span>
            <strong>
              {state.phase === 'playing-source' && 'Listen closely…'}
              {state.phase === 'ready' && 'Hear this line first'}
              {state.phase === 'ready-to-record' && 'Now say it your way'}
              {state.phase === 'recording' && 'Recording…'}
              {state.phase === 'recorded' && 'Take saved'}
            </strong>
          </div>
          <div className="button-row">
            <button type="button" className="control-button" onClick={hearSource} disabled={!playerReady || state.phase === 'playing-source' || state.phase === 'recording' || busy}>▶ Hear Steve</button>
            {state.phase === 'recording' ? (
              <button aria-label="Stop" type="button" className="record-button is-recording" onClick={stopRecording} disabled={busy}>■ Stop</button>
            ) : (
              <button aria-label="Record" type="button" className="record-button" onClick={startRecording} disabled={!['ready-to-record', 'recorded'].includes(state.phase) || busy}>● Record</button>
            )}
            <button type="button" className="control-button" onClick={listenToTake} disabled={!takes.has(activeLine.id) || busy}>Listen</button>
            <button type="button" className="control-button" onClick={() => dispatch({ type: 'REDO' })} disabled={!takes.has(activeLine.id) || state.phase === 'recording' || busy}>Redo</button>
            <button aria-label="Next" type="button" className="next-button" onClick={advance} disabled={state.phase !== 'recorded' || busy}>Next →</button>
          </div>
        </section>
      )}

      {state.error && <p className="error-banner" role="alert">{state.error} {canRetryVideo && <button type="button" onClick={() => { dispatch({ type: 'CLEAR_ERROR' }); setCanRetryVideo(false); setPlayerReady(PlayerComponent !== YouTubePlayer); setPlayerAttempt((value) => value + 1) }}>Retry video</button>}</p>}
    </div>
  )
}
