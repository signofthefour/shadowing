import type { Speech } from '../../domain/types'
import { STANFORD_SPEECH } from './stanfordSpeech'
import { JFK_INAUGURAL_SPEECH } from './jfkInaugural'

export const SPEECHES: Speech[] = [STANFORD_SPEECH, JFK_INAUGURAL_SPEECH]
