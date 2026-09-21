import { readFile, writeFile } from 'node:fs/promises'
import { YoutubeTranscript } from 'youtube-transcript'

// Archived Stanford Report PDF converted with pdftotext -layout.
// https://static.longnow.org/media/djlongnow_media/press/pdf/020050614-SteveJobsYouvegottofindwhatyoulove.pdf
const pdfText = await readFile('/tmp/stanford-speech.txt', 'utf8')
const speechText = pdfText
  .split('\n')
  .filter((line) => !line.includes('Text of Steve Jobs') && !/^\s*\d of 4/.test(line) && !/\bStanford Report, June/.test(line) && !/You've got to find what you love/.test(line))
  .join(' ')
const first = speechText.indexOf('I am honored to be with you today')
const last = speechText.indexOf('Thank you all very much.', first)
if (first < 0 || last < 0) throw new Error('Stanford speech not found in archived text')
const sentences = speechText.slice(first, last + 'Thank you all very much.'.length)
  .replace(/\s+/g, ' ')
  .match(/[^.!?]+[.!?]+(?:[”"])?/g)
  ?.map((sentence) => sentence.trim())
  .filter(Boolean)

if (!sentences || sentences.length < 100) throw new Error('Too few sentences extracted')

const captions = await YoutubeTranscript.fetchTranscript('UF8uR6Z6KLc', { lang: 'en' })
const speechCaptions = captions.filter((row) => row.offset >= 26_080 && row.offset <= 873_000 && !/^\[/.test(row.text))
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
  const previous = sequence ? starts[sequence - 1] : 26.08
  const candidate = start >= 0 ? start : previous
  adjustedStarts.push(sequence ? Math.max(candidate, adjustedStarts[sequence - 1] + 0.2) : candidate)
})

const lines = sentences.map((sentence, sequence) => {
  const startSeconds = adjustedStarts[sequence]
  const nextStart = adjustedStarts[sequence + 1]
  return {
    id: `line-${String(sequence + 1).padStart(3, '0')}`,
    sequence,
    text: sentence,
    startSeconds: Number(startSeconds.toFixed(3)),
    endSeconds: Number((nextStart ?? 873).toFixed(3)),
  }
})

await writeFile(new URL('../src/data/stanfordSpeech.generated.json', import.meta.url), `${JSON.stringify(lines, null, 2)}\n`)
console.log(`Aligned ${lines.length} full sentences; edit distance ${costs.at(-1)}.`)
