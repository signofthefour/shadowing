import { describe, expect, it } from 'vitest'
import { EISENHOWER_FAREWELL_SPEECH } from './eisenhowerFarewell'
import { validateTranscript } from './validateTranscript'

describe('Eisenhower farewell address data', () => {
  it('covers the full official speech video with timed practice lines', () => {
    expect(EISENHOWER_FAREWELL_SPEECH.videoId).toBe('Lr9CrIfEA1A')
    expect(EISENHOWER_FAREWELL_SPEECH.lines.length).toBeGreaterThan(20)
    expect(EISENHOWER_FAREWELL_SPEECH.lines.at(-1)?.text).toMatch(/binding force of mutual respect and love\.?$/)
  })

  it('has unique, ordered, non-overlapping boundaries', () => {
    expect(validateTranscript(EISENHOWER_FAREWELL_SPEECH.lines)).toEqual([])
  })
})
