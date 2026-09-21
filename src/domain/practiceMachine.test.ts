import { describe, expect, it } from 'vitest'
import { transition } from './practiceMachine'
import type { PracticeState } from './types'

const initial: PracticeState = {
  phase: 'ready',
  activeIndex: 0,
  lineCount: 2,
  hasTake: false,
  error: null,
}

describe('practice state transitions', () => {
  it('moves through source playback, recording, and a saved take', () => {
    const playing = transition(initial, { type: 'HEAR_SOURCE' })
    const waiting = transition(playing, { type: 'SOURCE_FINISHED' })
    const recording = transition(waiting, { type: 'START_RECORDING' })
    const saved = transition(recording, { type: 'RECORDING_SAVED' })

    expect([playing.phase, waiting.phase, recording.phase, saved.phase]).toEqual([
      'playing-source',
      'ready-to-record',
      'recording',
      'recorded',
    ])
    expect(saved.hasTake).toBe(true)
  })

  it('advances from a ready line without a saved take', () => {
    expect(transition(initial, { type: 'NEXT' })).toEqual({
      ...initial,
      activeIndex: 1,
    })
  })

  it('advances without a take after source playback finishes', () => {
    const waiting = transition(transition(initial, { type: 'HEAR_SOURCE' }), { type: 'SOURCE_FINISHED' })
    expect(transition(waiting, { type: 'NEXT' }).activeIndex).toBe(1)
  })

  it('does not advance while source playback or recording is active', () => {
    expect(transition({ ...initial, phase: 'playing-source' }, { type: 'NEXT' }).activeIndex).toBe(0)
    expect(transition({ ...initial, phase: 'recording' }, { type: 'NEXT' }).activeIndex).toBe(0)
  })

  it('completes after advancing from the final saved take', () => {
    const final: PracticeState = {
      ...initial,
      activeIndex: 1,
      hasTake: true,
      phase: 'recorded',
    }

    expect(transition(final, { type: 'NEXT' }).phase).toBe('completed')
  })

  it('does not complete from an unrecorded final line', () => {
    const final: PracticeState = {
      ...initial,
      activeIndex: 1,
    }

    expect(transition(final, { type: 'NEXT' })).toEqual(final)
  })

  it('keeps an existing take when a redo recording fails', () => {
    const redoing: PracticeState = {
      ...initial,
      phase: 'recording',
      hasTake: true,
    }

    expect(
      transition(redoing, { type: 'RECORDING_FAILED', message: 'No audio captured.' }),
    ).toEqual({
      ...redoing,
      phase: 'recorded',
      error: 'No audio captured.',
    })
  })

  it('shows an external error outside recording state and exits source playback', () => {
    const playing = transition(initial, { type: 'HEAR_SOURCE' })
    expect(transition(playing, { type: 'EXTERNAL_ERROR', message: 'Video unavailable.' })).toEqual({
      ...initial,
      error: 'Video unavailable.',
    })
  })
})
