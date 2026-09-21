export type TranscriptLine = {
  id: string
  sequence: number
  text: string
  startSeconds: number
  endSeconds: number
}

export type StoredTake = {
  lineId: string
  blob: Blob
  mimeType: string
  durationMs: number
  recordedAt: string
}

export type PracticeSession = {
  speechId: 'steve-jobs-stanford-2005'
  activeLineId: string
  completedLineIds: string[]
  updatedAt: string
}

export type PracticePhase =
  | 'ready'
  | 'playing-source'
  | 'ready-to-record'
  | 'recording'
  | 'recorded'
  | 'completed'

export type PracticeState = {
  phase: PracticePhase
  activeIndex: number
  lineCount: number
  hasTake: boolean
  error: string | null
}

export type PracticeEvent =
  | { type: 'HEAR_SOURCE' }
  | { type: 'SOURCE_FINISHED' }
  | { type: 'START_RECORDING' }
  | { type: 'RECORDING_SAVED' }
  | { type: 'RECORDING_FAILED'; message: string }
  | { type: 'EXTERNAL_ERROR'; message: string }
  | { type: 'REDO' }
  | { type: 'NEXT' }
  | { type: 'SELECT_LINE'; index: number; hasTake: boolean }
  | { type: 'CLEAR_ERROR' }
