# Steve Jobs Shadowing Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, browser-only website that plays Stanford's Steve Jobs commencement video one sentence at a time, records the learner's matching take, restores progress, and exports the finished practice session as one MP3.

**Architecture:** A static React/TypeScript application owns an explicit practice state machine. Thin adapters isolate the YouTube IFrame API, MediaRecorder, IndexedDB, and MP3 encoder so browser integrations can be replaced by fakes in tests. The prepared transcript is a checked-in data asset; no server, account, upload, or runtime transcript generation exists.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Playwright, YouTube IFrame Player API, MediaRecorder, IndexedDB via `idb`, Web Audio API, and `@breezystack/lamejs`.

**Spec:** `docs/superpowers/specs/2026-09-16-steve-jobs-shadowing-design.md`

## Global Constraints

- Use Stanford's official YouTube video ID `UF8uR6Z6KLc`.
- Support one prepared speech only; do not add arbitrary video input.
- Keep audio and progress entirely in the browser; do not add a backend or analytics.
- Record one learner take per sentence; do not add ASR, scoring, or continuous recording.
- A refresh or browser restart must restore successful recordings and the active sentence.
- MP3 export must not delete the session; only confirmed discard may delete it.
- Provide Quit & Erase throughout practice; canceled confirmation changes nothing, while confirmed deletion resets to the first sentence.
- Do not rely on tab-close or browser-shutdown events for deletion.
- Desktop uses a two-column layout; mobile stacks video above transcript.
- Use semantic controls, visible focus states, and reduced-motion-safe scrolling.

## File Structure

```text
src/
  app/App.tsx                         app composition, restored-session startup, and quit action
  app/App.css                         responsive visual system and component states
  domain/practiceMachine.ts           pure practice-state transitions
  domain/practiceMachine.test.ts
  domain/types.ts                     shared transcript, recording, and session types
  data/stanfordSpeech.ts              validated prepared transcript and video metadata
  data/stanfordSpeech.test.ts
  features/player/YouTubePlayer.tsx   iframe lifecycle and UI container
  features/player/youtubeApi.ts       typed API loader and player adapter
  features/player/youtubeApi.test.ts
  features/transcript/Transcript.tsx  lyric view, highlighting, scrolling, seeking
  features/transcript/Transcript.test.tsx
  features/recorder/audioRecorder.ts  MediaRecorder adapter and MIME selection
  features/recorder/audioRecorder.test.ts
  features/recorder/RecorderPanel.tsx record/listen/redo UI
  features/session/sessionStore.ts    IndexedDB persistence and atomic replacement
  features/session/sessionStore.test.ts
  features/export/mp3Exporter.ts      ordered decode, concatenate, and MP3 encode
  features/export/mp3Exporter.test.ts
  features/practice/PracticeScreen.tsx coordinates the complete guided loop
  features/practice/PracticeScreen.test.tsx
  features/finish/FinishScreen.tsx    download/discard completion UI
  test/fakes.ts                       reusable player, recorder, and storage fakes
  test/setup.ts                       DOM matchers and browser API shims
  main.tsx                            React entry point
e2e/practice.spec.ts                  browser smoke paths
playwright.config.ts                  browser test configuration
vite.config.ts                        Vite and Vitest configuration
```

---

### Task 1: Project Foundation and Practice State Machine

**Files:**
- Create: `package.json`, `package-lock.json`, `index.html`, `tsconfig.json`, `vite.config.ts`
- Create: `src/main.tsx`, `src/domain/types.ts`, `src/domain/practiceMachine.ts`
- Create: `src/domain/practiceMachine.test.ts`, `src/test/setup.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `TranscriptLine`, `StoredTake`, `PracticeSession`, `PracticeState`, `PracticeEvent`
- Produces: `transition(state: PracticeState, event: PracticeEvent): PracticeState`

- [ ] **Step 1: Initialize version control and scaffold the app**

Run:

```bash
git init
npm init -y
npm install react react-dom idb @breezystack/lamejs
npm install -D typescript vite @vitejs/plugin-react @types/react @types/react-dom vitest jsdom tsx fake-indexeddb @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

Create the listed Vite/React entry and configuration files without replacing the approved `docs/` directory. Add scripts `dev: "vite"`, `build: "tsc -b && vite build"`, `test: "vitest run"`, `test:watch: "vitest"`, and `test:e2e: "playwright test"` to `package.json`. Configure `vite.config.ts` with the React plugin, `environment: "jsdom"`, and `setupFiles: ["./src/test/setup.ts"]`.

- [ ] **Step 2: Define shared domain types**

Create `src/domain/types.ts`:

```ts
export type TranscriptLine = {
  id: string
  sequence: number
  text: string
  startSeconds: number
  endSeconds: number
}

export type StoredTake = {
  lineId: string
  blob: Blob
  mimeType: string
  durationMs: number
  recordedAt: string
}

export type PracticeSession = {
  speechId: 'steve-jobs-stanford-2005'
  activeLineId: string
  completedLineIds: string[]
  updatedAt: string
}

export type PracticePhase =
  | 'ready'
  | 'playing-source'
  | 'ready-to-record'
  | 'recording'
  | 'recorded'
  | 'completed'

export type PracticeState = {
  phase: PracticePhase
  activeIndex: number
  lineCount: number
  hasTake: boolean
  error: string | null
}

export type PracticeEvent =
  | { type: 'HEAR_SOURCE' }
  | { type: 'SOURCE_FINISHED' }
  | { type: 'START_RECORDING' }
  | { type: 'RECORDING_SAVED' }
  | { type: 'RECORDING_FAILED'; message: string }
  | { type: 'REDO' }
  | { type: 'NEXT' }
  | { type: 'SELECT_LINE'; index: number; hasTake: boolean }
  | { type: 'CLEAR_ERROR' }
```

- [ ] **Step 3: Write failing state-transition tests**

Create `src/domain/practiceMachine.test.ts` with tests that assert:

```ts
import { describe, expect, it } from 'vitest'
import { transition } from './practiceMachine'
import type { PracticeState } from './types'

const initial: PracticeState = {
  phase: 'ready', activeIndex: 0, lineCount: 2, hasTake: false, error: null,
}

describe('transition', () => {
  it('moves through hear, pause, record, and save', () => {
    const playing = transition(initial, { type: 'HEAR_SOURCE' })
    const waiting = transition(playing, { type: 'SOURCE_FINISHED' })
    const recording = transition(waiting, { type: 'START_RECORDING' })
    const saved = transition(recording, { type: 'RECORDING_SAVED' })
    expect([playing.phase, waiting.phase, recording.phase, saved.phase])
      .toEqual(['playing-source', 'ready-to-record', 'recording', 'recorded'])
    expect(saved.hasTake).toBe(true)
  })

  it('does not advance without a take', () => {
    expect(transition(initial, { type: 'NEXT' })).toEqual(initial)
  })

  it('completes after the final saved take', () => {
    const final: PracticeState = { ...initial, activeIndex: 1, hasTake: true, phase: 'recorded' }
    expect(transition(final, { type: 'NEXT' }).phase).toBe('completed')
  })
})
```

- [ ] **Step 4: Run the test and verify failure**

Run: `npm test -- src/domain/practiceMachine.test.ts`

Expected: FAIL because `practiceMachine.ts` does not exist.

- [ ] **Step 5: Implement guarded state transitions**

Create `src/domain/practiceMachine.ts` as a pure exhaustive switch. Return the unchanged state for events invalid in the current phase. `NEXT` advances only when `hasTake` is true, resets `hasTake` for the next line, and enters `completed` on the final line. `RECORDING_FAILED` returns to `ready-to-record` without clearing an existing take.

- [ ] **Step 6: Verify foundation**

Run:

```bash
npm test -- src/domain/practiceMachine.test.ts
npm run build
```

Expected: all state tests PASS and the production build succeeds.

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json package-lock.json index.html tsconfig*.json vite.config.ts src/main.tsx src/domain src/test/setup.ts docs
git commit -m "chore: scaffold shadowing practice app"
```

---

### Task 2: Prepared Timed Transcript

**Files:**
- Create: `src/data/stanfordSpeech.ts`
- Create: `src/data/stanfordSpeech.test.ts`
- Create: `scripts/validate-transcript.mts`

**Interfaces:**
- Consumes: `TranscriptLine`
- Produces: `STANFORD_SPEECH: { id; title; videoId; lines: TranscriptLine[] }`
- Produces: `validateTranscript(lines: TranscriptLine[]): string[]`

- [ ] **Step 1: Write transcript invariant tests**

Create `src/data/stanfordSpeech.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STANFORD_SPEECH, validateTranscript } from './stanfordSpeech'

describe('Stanford speech data', () => {
  it('uses the official Stanford upload and a complete prepared transcript', () => {
    expect(STANFORD_SPEECH.videoId).toBe('UF8uR6Z6KLc')
    expect(STANFORD_SPEECH.lines.length).toBeGreaterThan(100)
    expect(STANFORD_SPEECH.lines.at(-1)?.text).toMatch(/thank you/i)
  })

  it('has unique, ordered, non-overlapping boundaries', () => {
    expect(validateTranscript(STANFORD_SPEECH.lines)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/data/stanfordSpeech.test.ts`

Expected: FAIL because the speech module does not exist.

- [ ] **Step 3: Add the prepared transcript asset and validator**

Create `src/data/stanfordSpeech.ts`. Use Stanford's published prepared text as the canonical wording and the official video's English caption timing as the timing source. Split long captions at sentence punctuation, then manually verify each boundary against the video. Model every entry exactly as:

```ts
import type { TranscriptLine } from '../domain/types'

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
  lines: TRANSCRIPT_LINES,
}
```

Define `TRANSCRIPT_LINES` above the export as the complete speech, beginning with “I'm honored to be with you today…” and ending with “Thank you all very much.” The line array is the product asset, not generated at runtime. Give IDs the stable form `line-001`, `line-002`, and so on. Add `scripts/validate-transcript.mts` to import the asset, print every validation error, and exit nonzero when any error exists.

- [ ] **Step 4: Verify data automatically and manually**

Run:

```bash
npm test -- src/data/stanfordSpeech.test.ts
npx tsx scripts/validate-transcript.mts
```

Expected: both commands exit 0. Then sample the first line, each of the three story transitions, and the final line in the official video; each pause boundary must land within 300 ms of the spoken sentence end.

- [ ] **Step 5: Commit**

```bash
git add src/data scripts/validate-transcript.mts package.json package-lock.json
git commit -m "feat: add timed Stanford speech transcript"
```

---

### Task 3: YouTube Sentence Playback and Lyric Transcript

**Files:**
- Create: `src/features/player/youtubeApi.ts`, `src/features/player/youtubeApi.test.ts`
- Create: `src/features/player/YouTubePlayer.tsx`
- Create: `src/features/transcript/Transcript.tsx`, `src/features/transcript/Transcript.test.tsx`
- Create: `src/test/fakes.ts`

**Interfaces:**
- Consumes: `videoId: string`, `TranscriptLine`, `activeLineId: string`
- Produces: `YouTubePort` with `playRange(startSeconds, endSeconds)`, `cue(seconds)`, `destroy()`
- Produces: `<YouTubePlayer line onFinished onError />`
- Produces: `<Transcript lines activeLineId onSelect />`

- [ ] **Step 1: Write failing playback-adapter tests**

Test that `playRange(10.2, 14.8)` calls:

```ts
player.loadVideoById({
  videoId: 'UF8uR6Z6KLc',
  startSeconds: 10.2,
  endSeconds: 14.8,
})
```

Test that an `ENDED` state invokes `onFinished`, `cue(20)` calls `seekTo(20, true)` followed by `pauseVideo()`, and `destroy()` removes the iframe player.

- [ ] **Step 2: Run playback tests and verify failure**

Run: `npm test -- src/features/player/youtubeApi.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the typed YouTube adapter**

Load `https://www.youtube.com/iframe_api` once, preserve an existing global callback, and resolve all waiting callers when `YT.Player` is ready. Wrap the minimal methods behind:

```ts
export type YouTubePort = {
  playRange(startSeconds: number, endSeconds: number): void
  cue(seconds: number): void
  destroy(): void
}

export async function createYouTubePort(options: {
  elementId: string
  videoId: string
  onFinished: () => void
  onError: (message: string) => void
}): Promise<YouTubePort>
```

Use `loadVideoById` object syntax with `startSeconds` and `endSeconds`; use `pauseVideo`, not `stopVideo`, for cueing and normal pauses.

- [ ] **Step 4: Write failing transcript component tests**

Render three lines and assert the active line has `aria-current="true"`, clicking the third line calls `onSelect('line-003')`, and changing `activeLineId` calls `scrollIntoView` with `{ block: 'center' }`. Add a reduced-motion test that expects `behavior: 'auto'` when `matchMedia('(prefers-reduced-motion: reduce)')` matches.

- [ ] **Step 5: Implement player and transcript components**

`YouTubePlayer` creates one adapter on mount, destroys it on unmount, and calls `playRange` only when its parent explicitly requests playback. `Transcript` renders semantic buttons inside a labelled scroll region, shows two or more neighboring lines, and never steals keyboard focus during automatic scrolling.

- [ ] **Step 6: Verify playback and transcript**

Run:

```bash
npm test -- src/features/player src/features/transcript
npm run build
```

Expected: all tests PASS and TypeScript reports no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/player src/features/transcript src/test/fakes.ts
git commit -m "feat: synchronize sentence playback and transcript"
```

---

### Task 4: Sentence Recorder and Durable Local Session

**Files:**
- Create: `src/features/recorder/audioRecorder.ts`, `src/features/recorder/audioRecorder.test.ts`
- Create: `src/features/recorder/RecorderPanel.tsx`
- Create: `src/features/session/sessionStore.ts`, `src/features/session/sessionStore.test.ts`

**Interfaces:**
- Produces: `AudioRecorderPort` with `start()`, `stop(): Promise<RecordedAudio>`, `release()`
- Produces: `createAudioRecorder(): Promise<AudioRecorderPort>`
- Produces: `SessionStore` with `load`, `saveProgress`, `replaceTake`, `listTakes`, `discard`
- Consumes: `StoredTake`, `PracticeSession`

- [ ] **Step 1: Write failing recorder tests**

Mock `navigator.mediaDevices.getUserMedia` and `MediaRecorder`. Assert that the recorder requests `{ audio: true }`, selects the first supported type from `audio/webm;codecs=opus`, `audio/mp4`, and `audio/webm`, combines `dataavailable` chunks, records duration, and stops every stream track in `release()`.

- [ ] **Step 2: Implement the recorder adapter**

Use this public contract:

```ts
export type RecordedAudio = {
  blob: Blob
  mimeType: string
  durationMs: number
}

export type AudioRecorderPort = {
  start(): void
  stop(): Promise<RecordedAudio>
  release(): void
}

export async function createAudioRecorder(): Promise<AudioRecorderPort>
```

Map `NotAllowedError` to “Microphone access is blocked. Enable it in your browser settings, then try again.” Map unsupported APIs and empty blobs to distinct actionable errors.

- [ ] **Step 3: Write failing IndexedDB store tests**

Use the installed `fake-indexeddb` dev dependency. Test a new session, progress restoration, ordered take listing, successful replacement of one line only, and complete discard. Specifically assert that a failed transaction leaves the previous take intact.

- [ ] **Step 4: Implement the session store**

Create IndexedDB database `shadowing-practice`, version 1, with stores `session` and `takes`. Use `speechId` as the session key and `[speechId, lineId]` as the take key. Export:

```ts
export type SessionStore = {
  load(speechId: PracticeSession['speechId']): Promise<{
    session: PracticeSession | null
    takes: StoredTake[]
  }>
  saveProgress(session: PracticeSession): Promise<void>
  replaceTake(speechId: PracticeSession['speechId'], take: StoredTake): Promise<void>
  listTakes(speechId: PracticeSession['speechId']): Promise<StoredTake[]>
  discard(speechId: PracticeSession['speechId']): Promise<void>
}

export function createSessionStore(): SessionStore
```

Perform replacement in one read-write transaction. Delete both progress and takes in one discard transaction.

- [ ] **Step 5: Implement the recorder panel**

Render Record/Stop, Listen, and Redo from state supplied by the parent. Create object URLs only for active previews and revoke each URL on replacement or unmount. Preserve the successful prior take until a redo produces a non-empty replacement.

- [ ] **Step 6: Verify recording and persistence**

Run:

```bash
npm test -- src/features/recorder src/features/session
npm run build
```

Expected: all tests PASS, including atomic replacement and complete discard.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/features/recorder src/features/session
git commit -m "feat: record and restore sentence takes"
```

---

### Task 5: Ordered MP3 Export

**Files:**
- Create: `src/features/export/mp3Exporter.ts`
- Create: `src/features/export/mp3Exporter.test.ts`
- Create: `src/types/lamejs.d.ts`

**Interfaces:**
- Consumes: `takes: StoredTake[]`, `lineOrder: string[]`
- Produces: `exportSessionMp3(options): Promise<Blob>`

- [ ] **Step 1: Write failing exporter tests**

Mock `AudioContext.decodeAudioData` and the MP3 encoder. Verify that input takes are sorted by `lineOrder`, converted to mono 44.1 kHz PCM, separated by 350 ms of silence, encoded in 1152-sample frames, and returned as `Blob` type `audio/mpeg`. Verify that a missing take reports the exact missing line ID instead of producing a partial file.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/features/export/mp3Exporter.test.ts`

Expected: FAIL because the exporter does not exist.

- [ ] **Step 3: Implement deterministic MP3 assembly**

Export:

```ts
export async function exportSessionMp3(options: {
  takes: StoredTake[]
  lineOrder: string[]
  gapMs?: number
  fileSampleRate?: 44100
}): Promise<Blob>
```

Decode each blob through `AudioContext`, down-mix channels by averaging, resample with `OfflineAudioContext` when needed, insert zero-valued PCM for the gap, clamp samples to `[-1, 1]`, convert to signed 16-bit PCM, and feed `Mp3Encoder(1, 44100, 128)`. Append `flush()` output and close audio contexts in `finally` blocks.

- [ ] **Step 4: Verify export**

Run:

```bash
npm test -- src/features/export/mp3Exporter.test.ts
npm run build
```

Expected: exporter tests PASS and the generated bundle resolves the encoder without global-variable errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/export src/types
git commit -m "feat: export ordered practice takes as mp3"
```

---

### Task 6: Integrated Guided Practice Screen

**Files:**
- Create: `src/features/practice/PracticeScreen.tsx`
- Create: `src/features/practice/PracticeScreen.test.tsx`
- Create: `src/features/finish/FinishScreen.tsx`
- Create: `src/app/App.tsx`, `src/app/App.css`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `STANFORD_SPEECH`, `transition`, `SessionStore`, `AudioRecorderPort`, `exportSessionMp3`
- Produces: complete application UI and download/discard actions

- [ ] **Step 1: Write the failing guided-flow test**

Use fake player, recorder, and store ports. Assert this visible path:

```text
Hear Steve → source finishes → Record → Stop → Listen/Redo/Next enabled
Next → take persisted → next transcript line active
final Next → finish screen → Download MP3 or Discard Session
```

Also test click-to-seek, restored active position, a restored existing take, export without deletion, Quit & Erase cancellation, confirmed quit deletion, and finish-screen discard only after confirmation.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/features/practice/PracticeScreen.test.tsx`

Expected: FAIL because the screen does not exist.

- [ ] **Step 3: Implement the orchestration**

Keep browser adapters injectable through props with production defaults. Persist a take before dispatching `RECORDING_SAVED`; persist progress before visually advancing. On restore, choose the stored `activeLineId`, falling back to the first line if it no longer exists. Selecting a line cues and pauses the player; it does not auto-play.

Add a persistent Quit & Erase button to the application header. On confirmation, release the active microphone stream, stop preview audio, call `store.discard`, clear in-memory take URLs, and reset to the first line only after deletion succeeds. Canceling must not call the store. A deletion failure keeps the current session visible and shows Retry.

- [ ] **Step 4: Implement finish actions**

`FinishScreen` calls the exporter and downloads `steve-jobs-shadowing-session.mp3` through a temporary object URL. Disable Download while encoding and retain the session on success or failure. Discard opens a native or accessible custom confirmation, calls `store.discard`, revokes URLs, and returns to the first line only after deletion succeeds.

- [ ] **Step 5: Implement the responsive visual system**

Use a warm off-white page, near-black text, one restrained amber accent, and large transcript typography. Desktop grid columns are `minmax(320px, 1fr) minmax(360px, 0.9fr)`; below `760px`, switch to one column. Make the player 16:9 and never smaller than 200 × 200 CSS pixels. Keep the control bar sticky inside the page, not fixed over transcript content. Use `aria-live="polite"` for phase/error messages and `:focus-visible` for keyboard focus.

- [ ] **Step 6: Verify the integrated app**

Run:

```bash
npm test
npm run build
```

Expected: all unit/integration tests PASS and the production bundle builds.

- [ ] **Step 7: Commit**

```bash
git add src/app src/features/practice src/features/finish src/main.tsx
git commit -m "feat: complete guided shadowing practice flow"
```

---

### Task 7: Browser Smoke Tests and Failure Recovery

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/practice.spec.ts`
- Modify: `package.json`
- Modify: `src/features/practice/PracticeScreen.tsx`
- Modify: `src/app/App.css`

**Interfaces:**
- Consumes: complete application
- Produces: repeatable Chromium smoke coverage and final accessibility/error polish

- [ ] **Step 1: Configure browser testing**

Configure Playwright to run `npm run dev -- --host 127.0.0.1` at `http://127.0.0.1:4173`, reuse an existing local server, and run Chromium at desktop and mobile viewport sizes. Add `test:e2e` to `package.json`.

- [ ] **Step 2: Write browser smoke tests**

Intercept the YouTube API script with a deterministic fake and grant microphone permission with fake media devices. Cover:

```ts
test('completes one guided sentence and restores it after reload', async ({ page }) => {})
test('shows a microphone permission recovery message', async ({ page }) => {})
test('keeps controls reachable at a mobile viewport', async ({ page }) => {})
test('quit and erase cancels safely, then deletes after confirmation', async ({ page }) => {})
```

The first test records a non-empty fake blob, advances, reloads, and asserts the new active line plus the completed progress count. The quit test cancels once to prove data remains, then confirms and proves IndexedDB is empty and the first sentence is active.

- [ ] **Step 3: Run browser tests and capture failures**

Run:

```bash
npx playwright install chromium
npm run test:e2e
```

Expected: initial failures identify any unimplemented recovery or responsive behavior; do not weaken assertions.

- [ ] **Step 4: Complete recovery states**

Add one inline alert region with Retry for YouTube/network errors, Try Microphone Again for permission recovery, Retry Export for encoder failures, and a storage-full message that preserves the previous take. Ensure controls disable only for the operation they conflict with.

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
npm test
npm run test:e2e
npm run build
```

Expected: unit/integration tests PASS, all Chromium smoke tests PASS at both viewport projects, and the production build exits 0.

- [ ] **Step 6: Manual acceptance check**

Run `npm run dev`, use a real microphone, and verify one sentence in Chrome plus one sentence in Safari or Firefox. Confirm source playback stops within 300 ms of the prepared boundary, redo replaces only that line, refresh restores it, the MP3 plays locally, and confirmed discard removes it.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json src
git commit -m "test: verify shadowing flow in the browser"
```

## Reference Documentation

- YouTube IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- Stanford video: https://www.youtube.com/watch?v=UF8uR6Z6KLc
- Stanford prepared transcript: https://news.stanford.edu/stories/2005/06/youve-got-find-love-jobs-says
- MediaRecorder: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- Vitest: https://vitest.dev/guide/
