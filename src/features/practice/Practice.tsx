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
import { transition } from '../../domain/practiceMachine'
import type { PracticeState, Speech, StoredTake } from '../../domain/types'
import { exportSessionMp3 } from '../export/mp3Exporter'
import { createAudioRecorder, type AudioRecorderPort } from '../recorder/audioRecorder'
import { YouTubePlayer, type YouTubePlayerHandle } from '../player/YouTubePlayer'
import type { SessionStore } from '../session/sessionStore'
import { Transcript } from '../transcript/Transcript'
import '../../app/App.css'

type PlayerProps = {
  videoId: string
  onFinished: () => void
  onError: (message: string) => void
  onReady?: () => void
}

type PracticeProps = {
  speech: Speech
  store: SessionStore
  onExitToLibrary: () => void
  playerComponent?: ComponentType<PlayerProps & RefAttributes<YouTubePlayerHandle>>
  recorderFactory?: () => Promise<AudioRecorderPort>
}

function recordingFailureMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return 'Browser storage is full. Clear some space and record again.'
  }
  return error instanceof Error ? error.message : 'The recording could not be saved.'
}

export function Practice({
  speech,
  store,
  onExitToLibrary,
  playerComponent: PlayerComponent = YouTubePlayer,
  recorderFactory = createAudioRecorder,
}: PracticeProps) {
  const [state, dispatch] = useReducer(transition, speech, (initialSpeech): PracticeState => ({
    phase: 'ready',
    activeIndex: 0,
    lineCount: initialSpeech.lines.length,
    hasTake: false,
    error: null,
  }))
  const [takes, setTakes] = useState<Map<string, StoredTake>>(new Map())
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canRetryVideo, setCanRetryVideo] = useState(false)
  const [playerReady, setPlayerReady] = useState(PlayerComponent !== YouTubePlayer)
  const [playerAttempt, setPlayerAttempt] = useState(0)
  const playerRef = useRef<YouTubePlayerHandle>(null)
  const recorderRef = useRef<AudioRecorderPort | null>(null)
  const positionSaveRef = useRef(false)
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
    store.load(speech.id).then(({ session, takes: restoredTakes }) => {
      if (!current) return
      const restoredIndex = session
        ? speech.lines.findIndex((line) => line.id === session.activeLineId)
        : 0
      const index = restoredIndex >= 0 ? restoredIndex : 0
      const restoredMap = new Map(restoredTakes.map((take) => [take.lineId, take]))
      setTakes(restoredMap)
      dispatch({
        type: 'SELECT_LINE',
        index,
        hasTake: restoredMap.has(speech.lines[index].id),
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
  }, [store, speech, showError])

  const activeLine = speech.lines[state.activeIndex]
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
      await store.replaceTake(speech.id, take)
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
    if (busy || positionSaveRef.current) return
    positionSaveRef.current = true
    setBusy(true)
    try {
      if (state.activeIndex === speech.lines.length - 1) {
        const missing = speech.lines.find((line) => !takes.has(line.id))
        if (missing) {
          showError('Some lines are still unrecorded. Select a missing line to finish the speech.')
          return
        }
      }
      const nextIndex = Math.min(state.activeIndex + 1, speech.lines.length - 1)
      await store.saveProgress({
        speechId: speech.id,
        activeLineId: speech.lines[nextIndex].id,
        completedLineIds: Array.from(takes.keys()),
        updatedAt: new Date().toISOString(),
      })
      dispatch({ type: 'NEXT' })
    } catch {
      showError('Progress could not be saved. Free browser storage and try again.')
    } finally {
      positionSaveRef.current = false
      setBusy(false)
    }
  }

  async function selectLine(lineId: string) {
    if (busy || positionSaveRef.current || state.phase === 'recording') return
    const index = speech.lines.findIndex((line) => line.id === lineId)
    if (index < 0) return
    positionSaveRef.current = true
    setBusy(true)
    try {
      await store.saveProgress({
        speechId: speech.id,
        activeLineId: lineId,
        completedLineIds: Array.from(takes.keys()),
        updatedAt: new Date().toISOString(),
      })
      playerRef.current?.cue(speech.lines[index].startSeconds)
      dispatch({ type: 'SELECT_LINE', index, hasTake: takes.has(lineId) })
    } catch {
      showError('Position could not be saved. Free browser storage and try again.')
    } finally {
      positionSaveRef.current = false
      setBusy(false)
    }
  }

  async function quitAndErase() {
    if (!window.confirm(`Delete all recordings and progress for "${speech.title}"?`)) return
    setBusy(true)
    try {
      recorderRef.current?.release()
      recorderRef.current = null
      previewRef.current?.pause()
      await store.discard(speech.id)
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
        lineOrder: speech.lines.map((line) => line.id),
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${speech.id}-shadowing-session.mp3`
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
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Speak Along home">Speak Along</a>
        <button type="button" className="quiet-button" onClick={onExitToLibrary}>◀ Library</button>
        <div className="session-meta">
          <span className="speech-name">{speech.title}</span>
          <span className="recorded-count">{takes.size} recorded</span>
          <button className="quiet-button" type="button" onClick={quitAndErase} disabled={busy}>
            Quit &amp; Erase
          </button>
        </div>
      </header>

      <main className="practice-layout">
        <section className="video-card" aria-label="Speech video">
          <PlayerComponent key={playerAttempt} ref={playerRef} videoId={speech.videoId} onFinished={handleSourceFinished} onError={showVideoError} onReady={handlePlayerReady} />
        </section>

        <section className="transcript-card" aria-label="Timed transcript">
          <Transcript lines={speech.lines} activeLineId={activeLine.id} onSelect={selectLine} disabled={busy || state.phase === 'recording' || state.phase === 'playing-source'} />
          <p className="progress">Line {state.activeIndex + 1} of {speech.lines.length}</p>
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
            <button type="button" className="control-button" onClick={hearSource} disabled={!playerReady || state.phase === 'playing-source' || state.phase === 'recording' || busy}>▶ Hear this line</button>
            {state.phase === 'recording' ? (
              <button aria-label="Stop" type="button" className="record-button is-recording" onClick={stopRecording} disabled={busy}>■ Stop</button>
            ) : (
              <button aria-label="Record" type="button" className="record-button" onClick={startRecording} disabled={!['ready-to-record', 'recorded'].includes(state.phase) || busy}>● Record</button>
            )}
            <button type="button" className="control-button" onClick={listenToTake} disabled={!takes.has(activeLine.id) || busy}>Listen</button>
            <button type="button" className="control-button" onClick={() => dispatch({ type: 'REDO' })} disabled={!takes.has(activeLine.id) || state.phase === 'recording' || busy}>Redo</button>
            <button aria-label="Next" type="button" className="next-button" onClick={advance} disabled={!['ready', 'ready-to-record', 'recorded'].includes(state.phase) || busy}>Next →</button>
          </div>
        </section>
      )}

      {state.error && <p className="error-banner" role="alert">{state.error} {canRetryVideo && <button type="button" onClick={() => { dispatch({ type: 'CLEAR_ERROR' }); setCanRetryVideo(false); setPlayerReady(PlayerComponent !== YouTubePlayer); setPlayerAttempt((value) => value + 1) }}>Retry video</button>}</p>}
    </div>
  )
}
