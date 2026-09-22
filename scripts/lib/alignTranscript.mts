import { YoutubeTranscript } from 'youtube-transcript'

export type AlignedLine = {
  id: string
  sequence: number
  text: string
  startSeconds: number
  endSeconds: number
}

export type AlignTranscriptOptions = {
  videoId: string
  speechText: string
  minimumSentences?: number
  startSeconds?: number
}

export type AlignTranscriptResult = {
  lines: AlignedLine[]
  editDistance: number
}

export async function alignTranscript({
  videoId,
  speechText,
  minimumSentences = 20,
  startSeconds = 0,
}: AlignTranscriptOptions): Promise<AlignTranscriptResult> {
  const sentences = speechText
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]+(?:[""])?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean)

  if (!sentences || sentences.length < minimumSentences) {
    throw new Error(`Too few sentences extracted for ${videoId} (found ${sentences?.length ?? 0})`)
  }

  const captions = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' })
  const speechCaptions = captions.filter((row) => !/^\[/.test(row.text))
  if (speechCaptions.length === 0) throw new Error(`No usable captions for ${videoId}`)

  const normalize = (word: string) => word.toLowerCase().replace(/[^a-z0-9]/g, '')
  const canonicalWords = sentences.flatMap((sentence) => sentence.split(/\s+/).map(normalize).filter(Boolean))
  const captionWords = speechCaptions.flatMap((row, rowIndex) => {
    const words = row.text.split(/\s+/).map(normalize).filter(Boolean)
    const nextOffset = speechCaptions[rowIndex + 1]?.offset ?? row.offset + Math.min(row.duration, 4000)
    const span = Math.max(0, Math.min(nextOffset - row.offset, row.duration))
    return words.map((word, wordIndex) => ({
      word,
      time: (row.offset + (span * wordIndex) / words.length) / 1000,
    }))
  })

  // Global word alignment tolerates transcription errors and overlapping caption text.
  const width = captionWords.length + 1
  const costs = new Uint16Array((canonicalWords.length + 1) * width)
  const directions = new Uint8Array(costs.length)
  for (let i = 1; i <= canonicalWords.length; i++) costs[i * width] = i
  for (let j = 1; j <= captionWords.length; j++) costs[j] = j
  for (let i = 1; i <= canonicalWords.length; i++) {
    for (let j = 1; j <= captionWords.length; j++) {
      const at = i * width + j
      const diagonal = costs[at - width - 1] + (canonicalWords[i - 1] === captionWords[j - 1].word ? 0 : 1)
      const up = costs[at - width] + 1
      const left = costs[at - 1] + 1
      const minimum = Math.min(diagonal, up, left)
      costs[at] = minimum
      directions[at] = minimum === diagonal ? 0 : minimum === up ? 1 : 2
    }
  }

  const wordTimes: number[] = Array(canonicalWords.length).fill(-1)
  let i = canonicalWords.length
  let j = captionWords.length
  while (i > 0 && j > 0) {
    const direction = directions[i * width + j]
    if (direction === 0) {
      wordTimes[i - 1] = captionWords[j - 1].time
      i--
      j--
    } else if (direction === 1) i--
    else j--
  }

  let wordIndex = 0
  const starts = sentences.map((sentence) => {
    const words = sentence.split(/\s+/).map(normalize).filter(Boolean)
    const matched = wordTimes.slice(wordIndex, wordIndex + words.length).find((time) => time >= 0)
    wordIndex += words.length
    return matched ?? -1
  })

  const adjustedStarts: number[] = []
  starts.forEach((start, sequence) => {
    const previous = sequence ? starts[sequence - 1] : startSeconds
    const candidate = start >= 0 ? start : previous
    adjustedStarts.push(sequence ? Math.max(candidate, adjustedStarts[sequence - 1] + 0.2) : candidate)
  })

  const lastCaption = speechCaptions.at(-1)!
  const fallbackEnd = (lastCaption.offset + lastCaption.duration) / 1000

  const lines = sentences.map((sentence, sequence) => {
    const start = adjustedStarts[sequence]
    const nextStart = adjustedStarts[sequence + 1]
    return {
      id: `line-${String(sequence + 1).padStart(3, '0')}`,
      sequence,
      text: sentence,
      startSeconds: Number(start.toFixed(3)),
      endSeconds: Number((nextStart ?? fallbackEnd).toFixed(3)),
    }
  })

  return { lines, editDistance: costs.at(-1) ?? 0 }
}
