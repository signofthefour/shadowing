import type { Speech } from '../../domain/types'
import generatedLines from './stanfordSpeech.generated.json'

export const STANFORD_SPEECH: Speech = {
  id: 'steve-jobs-stanford-2005',
  title: "Steve Jobs' 2005 Stanford Commencement Address",
  videoId: 'UF8uR6Z6KLc',
  lines: generatedLines,
}
