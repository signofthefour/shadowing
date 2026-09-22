import type { Speech } from '../../domain/types'
import { STANFORD_SPEECH } from './stanfordSpeech'
import { JFK_INAUGURAL_SPEECH } from './jfkInaugural'
import { EISENHOWER_FAREWELL_SPEECH } from './eisenhowerFarewell'

export const SPEECHES: Speech[] = [STANFORD_SPEECH, JFK_INAUGURAL_SPEECH, EISENHOWER_FAREWELL_SPEECH]
