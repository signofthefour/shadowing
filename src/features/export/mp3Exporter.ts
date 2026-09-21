import { Mp3Encoder } from '@breezystack/lamejs'
import type { StoredTake } from '../../domain/types'

export function floatToInt16(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length)
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    output[index] = clamped < 0 ? clamped * 32768 : clamped * 32767
  })
  return output
}

function downMix(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel)
    for (let index = 0; index < source.length; index += 1) {
      mono[index] += source[index] / buffer.numberOfChannels
    }
  }
  return mono
}

async function decodeAndResample(
  context: AudioContext,
  blob: Blob,
  sampleRate: number,
): Promise<Float32Array> {
  const decoded = await context.decodeAudioData(await blob.arrayBuffer())
  if (decoded.sampleRate === sampleRate) return downMix(decoded)

  const offline = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * sampleRate),
    sampleRate,
  )
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  return downMix(await offline.startRendering())
}

export async function exportSessionMp3(options: {
  takes: StoredTake[]
  lineOrder: string[]
  gapMs?: number
}): Promise<Blob> {
  const sampleRate = 44_100
  const gapLength = Math.round(((options.gapMs ?? 350) / 1000) * sampleRate)
  const takesByLine = new Map(options.takes.map((take) => [take.lineId, take]))
  const missing = options.lineOrder.find((lineId) => !takesByLine.has(lineId))
  if (missing) throw new Error(`A recording is missing for ${missing}.`)

  const context = new AudioContext({ sampleRate })
  try {
    const sections: Float32Array[] = []
    for (const lineId of options.lineOrder) {
      sections.push(await decodeAndResample(context, takesByLine.get(lineId)!.blob, sampleRate))
      sections.push(new Float32Array(gapLength))
    }

    const totalLength = sections.reduce((sum, section) => sum + section.length, 0)
    const joined = new Float32Array(totalLength)
    let offset = 0
    for (const section of sections) {
      joined.set(section, offset)
      offset += section.length
    }

    const pcm = floatToInt16(joined)
    const encoder = new Mp3Encoder(1, sampleRate, 128)
    const chunks: ArrayBuffer[] = []
    for (let index = 0; index < pcm.length; index += 1152) {
      const encoded = encoder.encodeBuffer(pcm.subarray(index, index + 1152))
      if (encoded.length) chunks.push(Uint8Array.from(encoded).buffer)
    }
    const tail = encoder.flush()
    if (tail.length) chunks.push(Uint8Array.from(tail).buffer)
    return new Blob(chunks, { type: 'audio/mpeg' })
  } finally {
    await context.close()
  }
}
