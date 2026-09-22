import { type ComponentType, type RefAttributes, useMemo, useState } from 'react'
import { SPEECHES } from '../data/speeches'
import type { Speech } from '../domain/types'
import type { AudioRecorderPort } from '../features/recorder/audioRecorder'
import { Library } from '../features/library/Library'
import { Practice } from '../features/practice/Practice'
import type { YouTubePlayerHandle } from '../features/player/YouTubePlayer'
import { createSessionStore, type SessionStore } from '../features/session/sessionStore'

type PlayerProps = {
  videoId: string
  onFinished: () => void
  onError: (message: string) => void
  onReady?: () => void
}

type AppProps = {
  speeches?: Speech[]
  store?: SessionStore
  playerComponent?: ComponentType<PlayerProps & RefAttributes<YouTubePlayerHandle>>
  recorderFactory?: () => Promise<AudioRecorderPort>
}

const LAST_SPEECH_STORAGE_KEY = 'shadowing:lastSpeechId'

function readLastSpeechId(speeches: Speech[]): string | null {
  try {
    const stored = localStorage.getItem(LAST_SPEECH_STORAGE_KEY)
    return stored && speeches.some((speech) => speech.id === stored) ? stored : null
  } catch {
    return null
  }
}

function writeLastSpeechId(speechId: string | null) {
  try {
    if (speechId) localStorage.setItem(LAST_SPEECH_STORAGE_KEY, speechId)
    else localStorage.removeItem(LAST_SPEECH_STORAGE_KEY)
  } catch {
    // localStorage may be unavailable (private browsing); the in-memory selection still works this session.
  }
}

export function App({
  speeches = SPEECHES,
  store: suppliedStore,
  playerComponent,
  recorderFactory,
}: AppProps) {
  const store = useMemo(() => suppliedStore ?? createSessionStore(), [suppliedStore])
  const [selectedSpeechId, setSelectedSpeechId] = useState<string | null>(() => readLastSpeechId(speeches))

  const selectedSpeech = speeches.find((speech) => speech.id === selectedSpeechId) ?? null

  function selectSpeech(speechId: string) {
    setSelectedSpeechId(speechId)
    writeLastSpeechId(speechId)
  }

  function exitToLibrary() {
    setSelectedSpeechId(null)
    writeLastSpeechId(null)
  }

  if (!selectedSpeech) {
    return <Library speeches={speeches} store={store} onSelect={selectSpeech} />
  }

  return (
    <Practice
      key={selectedSpeech.id}
      speech={selectedSpeech}
      store={store}
      onExitToLibrary={exitToLibrary}
      playerComponent={playerComponent}
      recorderFactory={recorderFactory}
    />
  )
}
