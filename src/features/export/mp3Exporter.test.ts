import { describe, expect, it } from 'vitest'
import { floatToInt16 } from './mp3Exporter'

describe('MP3 PCM conversion', () => {
  it('clamps normalized audio into signed 16-bit samples', () => {
    expect(Array.from(floatToInt16(new Float32Array([-2, -1, 0, 0.5, 1, 2])))).toEqual([
      -32768,
      -32768,
      0,
      16383,
      32767,
      32767,
    ])
  })
})
