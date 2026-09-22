import { createSessionStore } from '../features/session/sessionStore'
import { Practice } from '../features/practice/Practice'
import { STANFORD_SPEECH } from '../data/speeches/stanfordSpeech'

export function App() {
  return <Practice speech={STANFORD_SPEECH} store={createSessionStore()} onExitToLibrary={() => {}} />
}
