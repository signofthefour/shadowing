import type { TranscriptLine } from '../domain/types'
import generatedLines from './stanfordSpeech.generated.json'

export function validateTranscript(lines: TranscriptLine[]): string[] {
  const errors: string[] = []
  const ids = new Set<string>()

  lines.forEach((line, index) => {
    if (ids.has(line.id)) errors.push(`duplicate id: ${line.id}`)
    ids.add(line.id)
    if (line.sequence !== index) errors.push(`sequence mismatch: ${line.id}`)
    if (!line.text.trim()) errors.push(`empty text: ${line.id}`)
    if (line.startSeconds < 0 || line.endSeconds <= line.startSeconds) {
      errors.push(`invalid range: ${line.id}`)
    }
    const previous = lines[index - 1]
    if (previous && line.startSeconds < previous.endSeconds) {
      errors.push(`overlap: ${previous.id}/${line.id}`)
    }
  })

  return errors
}

export const STANFORD_SPEECH = {
  id: 'steve-jobs-stanford-2005' as const,
  title: "Steve Jobs' 2005 Stanford Commencement Address",
  videoId: 'UF8uR6Z6KLc',
  lines: generatedLines satisfies TranscriptLine[],
}
