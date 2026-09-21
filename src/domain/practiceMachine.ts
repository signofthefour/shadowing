import type { PracticeEvent, PracticeState } from './types'

export function transition(
  state: PracticeState,
  event: PracticeEvent,
): PracticeState {
  switch (event.type) {
    case 'HEAR_SOURCE':
      return state.phase === 'ready' || state.phase === 'ready-to-record' || state.phase === 'recorded'
        ? { ...state, phase: 'playing-source', error: null }
        : state
    case 'SOURCE_FINISHED':
      return state.phase === 'playing-source'
        ? { ...state, phase: state.hasTake ? 'recorded' : 'ready-to-record' }
        : state
    case 'START_RECORDING':
      return state.phase === 'ready-to-record' || state.phase === 'recorded'
        ? { ...state, phase: 'recording', error: null }
        : state
    case 'RECORDING_SAVED':
      return state.phase === 'recording'
        ? { ...state, phase: 'recorded', hasTake: true, error: null }
        : state
    case 'RECORDING_FAILED':
      return state.phase === 'recording'
        ? {
            ...state,
            phase: state.hasTake ? 'recorded' : 'ready-to-record',
            error: event.message,
          }
        : state
    case 'EXTERNAL_ERROR':
      return {
        ...state,
        phase: state.phase === 'playing-source' ? (state.hasTake ? 'recorded' : 'ready') : state.phase,
        error: event.message,
      }
    case 'REDO':
      return state.phase === 'recorded'
        ? { ...state, phase: 'ready-to-record', error: null }
        : state
    case 'NEXT':
      if (!state.hasTake || state.phase !== 'recorded') return state
      if (state.activeIndex === state.lineCount - 1) {
        return { ...state, phase: 'completed', error: null }
      }
      return {
        ...state,
        phase: 'ready',
        activeIndex: state.activeIndex + 1,
        hasTake: false,
        error: null,
      }
    case 'SELECT_LINE':
      if (event.index < 0 || event.index >= state.lineCount) return state
      return {
        ...state,
        activeIndex: event.index,
        phase: event.hasTake ? 'recorded' : 'ready',
        hasTake: event.hasTake,
        error: null,
      }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
  }
}
