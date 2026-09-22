import { describe, expect, it } from 'vitest'
import { STANFORD_SPEECH } from './stanfordSpeech'
import { validateTranscript } from './validateTranscript'

describe('Stanford speech data', () => {
  it('covers the full official speech video with timed practice lines', () => {
    expect(STANFORD_SPEECH.videoId).toBe('UF8uR6Z6KLc')
    expect(STANFORD_SPEECH.lines.length).toBeGreaterThan(100)
    expect(STANFORD_SPEECH.lines[0].text).toMatch(/world\.$/)
    expect(STANFORD_SPEECH.lines.at(-1)?.text).toMatch(/thank you all very much/i)
  })

  it('has unique, ordered, non-overlapping boundaries', () => {
    expect(validateTranscript(STANFORD_SPEECH.lines)).toEqual([])
    expect(STANFORD_SPEECH.lines.some((line) => /http|news-service|stanford\.edu/i.test(line.text))).toBe(false)
  })
})
