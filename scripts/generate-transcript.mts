import { readFile, writeFile } from 'node:fs/promises'
import { alignTranscript } from './lib/alignTranscript.mts'

// Archived Stanford Report PDF converted with pdftotext -layout.
// https://static.longnow.org/media/djlongnow_media/press/pdf/020050614-SteveJobsYouvegottofindwhatyoulove.pdf
function extractStanfordText(pdfText: string): string {
  const speechText = pdfText
    .split('\n')
    .filter((line) => !line.includes('Text of Steve Jobs') && !/^\s*\d of 4/.test(line) && !/\bStanford Report, June/.test(line) && !/You've got to find what you love/.test(line))
    .join(' ')
  const first = speechText.indexOf('I am honored to be with you today')
  const last = speechText.indexOf('Thank you all very much.', first)
  if (first < 0 || last < 0) throw new Error('Stanford speech not found in archived text')
  return speechText.slice(first, last + 'Thank you all very much.'.length)
}

type SpeechSpec = {
  name: string
  videoId: string
  sourceTextPath: string | URL
  outputUrl: URL
  extractText: (rawText: string) => string
  minimumSentences: number
  startSeconds: number
}

const speeches: SpeechSpec[] = [
  {
    name: "John F. Kennedy's 1961 Inaugural Address",
    videoId: 'z5jGGYuep2Q',
    sourceTextPath: new URL('./sources/jfkInaugural.txt', import.meta.url),
    outputUrl: new URL('../src/data/speeches/jfkInaugural.generated.json', import.meta.url),
    extractText: (text) => text.trim(),
    minimumSentences: 20,
    startSeconds: 0,
  },
  {
    name: "Dwight D. Eisenhower's 1961 Farewell Address",
    videoId: 'Lr9CrIfEA1A',
    sourceTextPath: new URL('./sources/eisenhowerFarewell.txt', import.meta.url),
    outputUrl: new URL('../src/data/speeches/eisenhowerFarewell.generated.json', import.meta.url),
    extractText: (text) => text.trim(),
    minimumSentences: 20,
    startSeconds: 0,
  },
  {
    name: "Steve Jobs' 2005 Stanford Commencement Address",
    videoId: 'UF8uR6Z6KLc',
    sourceTextPath: '/tmp/stanford-speech.txt',
    outputUrl: new URL('../src/data/speeches/stanfordSpeech.generated.json', import.meta.url),
    extractText: extractStanfordText,
    minimumSentences: 100,
    startSeconds: 26.08,
  },
]

for (const speech of speeches) {
  const raw = await readFile(speech.sourceTextPath, 'utf8')
  const speechText = speech.extractText(raw)
  const { lines, editDistance } = await alignTranscript({
    videoId: speech.videoId,
    speechText,
    minimumSentences: speech.minimumSentences,
    startSeconds: speech.startSeconds,
  })
  await writeFile(speech.outputUrl, `${JSON.stringify(lines, null, 2)}\n`)
  console.log(`${speech.name}: aligned ${lines.length} sentences; edit distance ${editDistance}.`)
}
