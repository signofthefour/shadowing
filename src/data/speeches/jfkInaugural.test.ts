import { describe, expect, it } from 'vitest'
import { JFK_INAUGURAL_SPEECH } from './jfkInaugural'
import { validateTranscript } from './validateTranscript'

describe('JFK inaugural address data', () => {
  it('covers the full official speech video with timed practice lines', () => {
    expect(JFK_INAUGURAL_SPEECH.videoId).toBe('z5jGGYuep2Q')
    expect(JFK_INAUGURAL_SPEECH.lines.length).toBeGreaterThan(20)
    expect(JFK_INAUGURAL_SPEECH.lines[0].text).toMatch(/^Vice President Johnson/)
    expect(JFK_INAUGURAL_SPEECH.lines.at(-1)?.text).toMatch(/God's work must truly be our own\.?$/)
  })

  it('has unique, ordered, non-overlapping boundaries', () => {
    expect(validateTranscript(JFK_INAUGURAL_SPEECH.lines)).toEqual([])
  })
})
