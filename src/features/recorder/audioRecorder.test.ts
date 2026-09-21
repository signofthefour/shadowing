import { describe, expect, it } from 'vitest'
import { selectRecordingMimeType } from './audioRecorder'

describe('recording format selection', () => {
  it('uses the first browser-supported audio format', () => {
    expect(
      selectRecordingMimeType((type) => type === 'audio/mp4'),
    ).toBe('audio/mp4')
  })

  it('falls back to the browser default when no preferred format is supported', () => {
    expect(selectRecordingMimeType(() => false)).toBeUndefined()
  })
})
