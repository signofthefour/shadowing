# Multi-Speech Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded Steve Jobs speech with a small curated catalog of speeches, add a library screen for picking one, and prepare two additional real speeches (JFK's 1961 Inaugural Address, Eisenhower's 1961 Farewell Address) as sample content.

**Architecture:** `App.tsx` becomes a thin shell that shows either a new `Library` screen (speech picker with per-speech progress) or the existing practice flow — extracted unchanged into a new `Practice` component parameterized by a `Speech` prop instead of a hardcoded constant. The IndexedDB session store is already keyed by `speechId`; it only gains one read-only `getProgress` method. A generalized version of the existing transcript-alignment script produces the two new speeches' timing data the same way the Stanford one was produced.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, Playwright, `idb`, `youtube-transcript` (content-generation only, not shipped to the browser).

**Spec:** `docs/superpowers/specs/2026-09-22-multi-speech-library-design.md`

## Global Constraints

- No arbitrary user-supplied YouTube URLs and no in-app "add a speech" UI — new speeches are added by a developer via a data file (per spec's "Out of Scope").
- `practiceMachine.ts` and `Transcript.tsx` do not change — both are already generic over line count and content (per spec).
- The "last opened speech" convenience value lives in `localStorage`, never IndexedDB (per spec's "UI" section).
- Quit & Erase erases only the active speech's data, never the whole library (already true of the per-speech-keyed store; preserve this).
- New sample speech source texts must be public-domain or already-accepted-risk content; do not commit copyrighted third-party speech text (see Task 5/6 sourcing notes).

---

## Task 1: Widen practice types for multiple speeches

**Files:**
- Modify: `src/domain/types.ts:1-22`

**Interfaces:**
- Produces: `Speech` type — `{ id: string; title: string; videoId: string; lines: TranscriptLine[] }` — used by every later task that touches speech data, `Practice`, and `Library`.
- Produces: `PracticeSession.speechId: string` (was the literal `'steve-jobs-stanford-2005'`) — every `SessionStore` method already types its `speechId` parameter as `PracticeSession['speechId']`, so widening this one line widens the whole store API with no other code changes.

- [ ] **Step 1: Widen `PracticeSession.speechId` and add the `Speech` type**

Edit `src/domain/types.ts`. Replace:

```ts
export type PracticeSession = {
  speechId: 'steve-jobs-stanford-2005'
  activeLineId: string
  completedLineIds: string[]
  updatedAt: string
}
```

with:

```ts
export type Speech = {
  id: string
  title: string
  videoId: string
  lines: TranscriptLine[]
}

export type PracticeSession = {
  speechId: string
  activeLineId: string
  completedLineIds: string[]
  updatedAt: string
}
```

- [ ] **Step 2: Confirm the codebase still type-checks**

Run: `npm run build`
Expected: PASS. (The literal `'steve-jobs-stanford-2005'` used throughout the current code is still assignable to `string`, so nothing else needs to change yet.)

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts
git commit -m "Widen PracticeSession.speechId to string and add Speech type"
```

---

## Task 2: Move Stanford speech data into a speech catalog

**Files:**
- Create: `src/data/speeches/validateTranscript.ts`
- Create: `src/data/speeches/stanfordSpeech.ts` (moved from `src/data/stanfordSpeech.ts`)
- Create: `src/data/speeches/stanfordSpeech.generated.json` (moved from `src/data/stanfordSpeech.generated.json`)
- Create: `src/data/speeches/stanfordSpeech.test.ts` (moved from `src/data/stanfordSpeech.test.ts`)
- Create: `src/data/speeches/index.ts`
- Delete: `src/data/stanfordSpeech.ts`, `src/data/stanfordSpeech.generated.json`, `src/data/stanfordSpeech.test.ts`
- Modify: `src/app/App.tsx` (import path only, for now)
- Modify: `src/app/App.test.tsx` (import path only, for now)
- Modify: `e2e/practice.spec.ts:2` (import path only, for now)

**Interfaces:**
- Consumes: `Speech` type from Task 1.
- Produces: `SPEECHES: Speech[]` from `src/data/speeches/index.ts` — the catalog every later task (Library, App shell) reads from.
- Produces: `STANFORD_SPEECH: Speech` still exported from `src/data/speeches/stanfordSpeech.ts`, unchanged in content/shape from today.

- [ ] **Step 1: Extract the shared validator**

Create `src/data/speeches/validateTranscript.ts`:

```ts
import type { TranscriptLine } from '../../domain/types'

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
```

- [ ] **Step 2: Move the Stanford data module**

```bash
git mv src/data/stanfordSpeech.generated.json src/data/speeches/stanfordSpeech.generated.json
```

Create `src/data/speeches/stanfordSpeech.ts`:

```ts
import type { Speech } from '../../domain/types'
import generatedLines from './stanfordSpeech.generated.json'

export const STANFORD_SPEECH: Speech = {
  id: 'steve-jobs-stanford-2005',
  title: "Steve Jobs' 2005 Stanford Commencement Address",
  videoId: 'UF8uR6Z6KLc',
  lines: generatedLines,
}
```

Delete `src/data/stanfordSpeech.ts`.

- [ ] **Step 3: Move the Stanford data test**

```bash
git mv src/data/stanfordSpeech.test.ts src/data/speeches/stanfordSpeech.test.ts
```

Edit `src/data/speeches/stanfordSpeech.test.ts` to import the relocated validator:

```ts
import { describe, expect, it } from 'vitest'
import { STANFORD_SPEECH } from './stanfordSpeech'
import { validateTranscript } from './validateTranscript'

describe('Stanford speech data', () => {
  it('covers the full official speech video with timed practice lines', () => {
    expect(STANFORD_SPEECH.videoId).toBe('UF8uR6Z6KLc')
    expect(STANFORD_SPEECH.lines.length).toBeGreaterThan(100)
    expect(STANFORD_SPEECH.lines[0].text).toMatch(/world\.$/)
    expect(STANFORD_SPEECH.lines.at(-1)?.text).toMatch(/thank you all very much/i)
  })

  it('has unique, ordered, non-overlapping boundaries', () => {
    expect(validateTranscript(STANFORD_SPEECH.lines)).toEqual([])
    expect(STANFORD_SPEECH.lines.some((line) => /http|news-service|stanford\.edu/i.test(line.text))).toBe(false)
  })
})
```

- [ ] **Step 4: Add the catalog**

Create `src/data/speeches/index.ts`:

```ts
import type { Speech } from '../../domain/types'
import { STANFORD_SPEECH } from './stanfordSpeech'

export const SPEECHES: Speech[] = [STANFORD_SPEECH]
```

- [ ] **Step 5: Update the two current call sites' import paths**

In `src/app/App.tsx`, change:

```ts
import { STANFORD_SPEECH } from '../data/stanfordSpeech'
```

to:

```ts
import { STANFORD_SPEECH } from '../data/speeches/stanfordSpeech'
```

In `src/app/App.test.tsx`, change:

```ts
import { STANFORD_SPEECH } from '../data/stanfordSpeech'
```

to:

```ts
import { STANFORD_SPEECH } from '../data/speeches/stanfordSpeech'
```

In `e2e/practice.spec.ts`, change:

```ts
import transcriptLines from '../src/data/stanfordSpeech.generated.json' with { type: 'json' }
```

to:

```ts
import transcriptLines from '../src/data/speeches/stanfordSpeech.generated.json' with { type: 'json' }
```

- [ ] **Step 6: Run the full unit test suite and build**

Run: `npm test`
Expected: PASS, same test count as before this task.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/data src/app/App.tsx src/app/App.test.tsx e2e/practice.spec.ts
git commit -m "Move Stanford speech data into a speech catalog"
```

---

## Task 3: Add per-speech progress lookup to the session store

**Files:**
- Modify: `src/features/session/sessionStore.ts:18-26` (type), add a new method to the returned object
- Test: `src/features/session/sessionStore.test.ts`

**Interfaces:**
- Consumes: nothing new (uses the existing `session` object store and the existing `takes` store's `by-speech` index).
- Produces: `SessionStore.getProgress(speechId: string): Promise<{ completedCount: number; activeLineId: string | null }>` — consumed by `Library` in Task 8.

- [ ] **Step 1: Write the failing test**

Add to `src/features/session/sessionStore.test.ts` (inside the existing `describe('session store', ...)` block, after the two existing `it` blocks):

```ts
  it('reports progress without loading take blobs', async () => {
    const store = createSessionStore()

    expect(await store.getProgress(session.speechId)).toEqual({
      completedCount: 0,
      activeLineId: null,
    })

    await store.saveProgress(session)
    await store.replaceTake(session.speechId, take)

    expect(await store.getProgress(session.speechId)).toEqual({
      completedCount: 1,
      activeLineId: session.activeLineId,
    })
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/session/sessionStore.test.ts`
Expected: FAIL with `store.getProgress is not a function`.

- [ ] **Step 3: Implement `getProgress`**

In `src/features/session/sessionStore.ts`, add to the `SessionStore` type (after `load`):

```ts
export type SessionStore = {
  load(speechId: PracticeSession['speechId']): Promise<{
    session: PracticeSession | null
    takes: StoredTake[]
  }>
  getProgress(speechId: PracticeSession['speechId']): Promise<{
    completedCount: number
    activeLineId: string | null
  }>
  saveProgress(session: PracticeSession): Promise<void>
  replaceTake(speechId: PracticeSession['speechId'], take: StoredTake): Promise<void>
  discard(speechId: PracticeSession['speechId']): Promise<void>
}
```

Add the method to the object returned by `createSessionStore` (after `load`'s implementation):

```ts
    async getProgress(speechId) {
      const database = await openSessionDatabase()
      try {
        const transaction = database.transaction(['session', 'takes'], 'readonly')
        const session = (await transaction.objectStore('session').get(speechId)) ?? null
        const completedCount = await transaction.objectStore('takes').index('by-speech').count(speechId)
        await transaction.done
        return { completedCount, activeLineId: session?.activeLineId ?? null }
      } finally {
        database.close()
      }
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/session/sessionStore.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/session/sessionStore.ts src/features/session/sessionStore.test.ts
git commit -m "Add SessionStore.getProgress for cheap per-speech progress lookups"
```

---

## Task 4: Generalize the transcript-alignment script

**Files:**
- Create: `scripts/lib/alignTranscript.mts`
- Modify: `scripts/generate-transcript.mts` (full rewrite)

**Interfaces:**
- Produces: `alignTranscript(options: { videoId: string; speechText: string; minimumSentences?: number; startSeconds?: number }): Promise<{ lines: AlignedLine[]; editDistance: number }>` — consumed by the runner in this task and reused by Tasks 5 and 6.
- `AlignedLine` shape matches `TranscriptLine` exactly: `{ id, sequence, text, startSeconds, endSeconds }`.

This task is a behavior-preserving refactor: the word-alignment algorithm (dynamic-programming edit-distance match between the canonical sentence text and YouTube's caption words) is unchanged from the current `scripts/generate-transcript.mts:22-95`; it is only parameterized so it can run for more than one speech.

- [ ] **Step 1: Extract the reusable alignment function**

Create `scripts/lib/alignTranscript.mts`:

```ts
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
  captionWindow?: { fromMs: number; toMs: number }
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
  captionWindow,
}: AlignTranscriptOptions): Promise<AlignTranscriptResult> {
  const sentences = speechText
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]+(?:[”"])?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean)

  if (!sentences || sentences.length < minimumSentences) {
    throw new Error(`Too few sentences extracted for ${videoId} (found ${sentences?.length ?? 0})`)
  }

  const captions = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' })
  const speechCaptions = captions.filter((row) => {
    if (captionWindow && (row.offset < captionWindow.fromMs || row.offset > captionWindow.toMs)) return false
    return !/^\[/.test(row.text)
  })
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
```

- [ ] **Step 2: Rewrite the runner to loop over a table of speeches**

Replace the entire contents of `scripts/generate-transcript.mts` with:

```ts
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
  captionWindow?: { fromMs: number; toMs: number }
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
    captionWindow: { fromMs: 26_080, toMs: 873_000 },
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
    captionWindow: speech.captionWindow,
  })
  await writeFile(speech.outputUrl, `${JSON.stringify(lines, null, 2)}\n`)
  console.log(`${speech.name}: aligned ${lines.length} sentences; edit distance ${editDistance}.`)
}
```

The Stanford entry is listed last so a missing `/tmp/stanford-speech.txt` (expected — it is not checked into the repo) does not block generating the other two speeches when the script is run.

- [ ] **Step 3: Verify by inspection that the Stanford branch is unchanged**

Read through `extractStanfordText` and the `speeches` entry for Stanford above and confirm they reproduce, verbatim, the extraction logic and the `26.08`/`26_080`/`873_000` constants from the pre-refactor script — including the caption offset window. The pre-refactor script filtered captions with `captions.filter((row) => row.offset >= 26_080 && row.offset <= 873_000 && !/^\[/.test(row.text))`; the generalized `alignTranscript` must reproduce this exactly for Stanford via its `captionWindow` option (`{ fromMs: 26_080, toMs: 873_000 }`), while leaving JFK and Eisenhower unaffected (they pass no `captionWindow`, so only the bracket-caption filter applies to them — correct, since neither of their source videos needs trimming). Do not attempt to execute the Stanford branch — `/tmp/stanford-speech.txt` does not exist in this environment (confirmed: `ls /tmp/stanford-speech.txt` fails), and this matches the already-documented state of the repo (see `STATUS.md`, "the generated JSON is already checked in and the website does not run this script").

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/alignTranscript.mts scripts/generate-transcript.mts
git commit -m "Generalize the transcript-alignment script for multiple speeches"
```

(The two new `sourceTextPath` files referenced above don't exist yet — they're created in Tasks 5 and 6, which is also where this script is actually executed for the first time.)

---

## Task 5: Prepare JFK's 1961 Inaugural Address

**Files:**
- Create: `scripts/sources/jfkInaugural.txt`
- Create: `src/data/speeches/jfkInaugural.generated.json` (generated, not hand-written)
- Create: `src/data/speeches/jfkInaugural.ts`
- Create: `src/data/speeches/jfkInaugural.test.ts`
- Modify: `src/data/speeches/index.ts`

**Sourcing:** Video `z5jGGYuep2Q` ("ENGLISH SPEECH | PRESIDENT KENNEDY: 1961 Inaugural Address (English Subtitles)") was confirmed in this session to carry clean, manually-authored English captions starting at "Vice President Johnson, Mr. Speaker, Mr. Chief Justice..." and ending at "...that here on earth God's work must truly be our own." — matching the full address. The source text below is the complete address as published by the Avalon Project at Yale Law School (`https://avalon.law.yale.edu/20th_century/kennedy.asp`), a public-domain U.S. government work.

**Interfaces:**
- Consumes: `alignTranscript` from Task 4.
- Produces: adds a second entry to `SPEECHES` (from Task 2), consumed by Tasks 7-9.

- [ ] **Step 1: Add the source text**

Create `scripts/sources/jfkInaugural.txt`:

```text
Vice President Johnson, Mr. Speaker, Mr. Chief Justice, President Eisenhower, Vice President Nixon, President Truman, reverend clergy, fellow citizens, we observe today not a victory of party, but a celebration of freedom--symbolizing an end, as well as a beginning--signifying renewal, as well as change. For I have sworn before you and Almighty God the same solemn oath our forebears prescribed nearly a century and three quarters ago.

The world is very different now. For man holds in his mortal hands the power to abolish all forms of human poverty and all forms of human life. And yet the same revolutionary beliefs for which our forebears fought are still at issue around the globe--the belief that the rights of man come not from the generosity of the state, but from the hand of God.

We dare not forget today that we are the heirs of that first revolution. Let the word go forth from this time and place, to friend and foe alike, that the torch has been passed to a new generation of Americans--born in this century, tempered by war, disciplined by a hard and bitter peace, proud of our ancient heritage--and unwilling to witness or permit the slow undoing of those human rights to which this Nation has always been committed, and to which we are committed today at home and around the world.

Let every nation know, whether it wishes us well or ill, that we shall pay any price, bear any burden, meet any hardship, support any friend, oppose any foe, in order to assure the survival and the success of liberty.

This much we pledge--and more.

To those old allies whose cultural and spiritual origins we share, we pledge the loyalty of faithful friends. United, there is little we cannot do in a host of cooperative ventures. Divided, there is little we can do--for we dare not meet a powerful challenge at odds and split asunder.

To those new States whom we welcome to the ranks of the free, we pledge our word that one form of colonial control shall not have passed away merely to be replaced by a far more iron tyranny. We shall not always expect to find them supporting our view. But we shall always hope to find them strongly supporting their own freedom--and to remember that, in the past, those who foolishly sought power by riding the back of the tiger ended up inside.

To those peoples in the huts and villages across the globe struggling to break the bonds of mass misery, we pledge our best efforts to help them help themselves, for whatever period is required--not because the Communists may be doing it, not because we seek their votes, but because it is right. If a free society cannot help the many who are poor, it cannot save the few who are rich.

To our sister republics south of our border, we offer a special pledge--to convert our good words into good deeds--in a new alliance for progress--to assist free men and free governments in casting off the chains of poverty. But this peaceful revolution of hope cannot become the prey of hostile powers. Let all our neighbors know that we shall join with them to oppose aggression or subversion anywhere in the Americas. And let every other power know that this Hemisphere intends to remain the master of its own house.

To that world assembly of sovereign states, the United Nations, our last best hope in an age where the instruments of war have far outpaced the instruments of peace, we renew our pledge of support--to prevent it from becoming merely a forum for invective--to strengthen its shield of the new and the weak--and to enlarge the area in which its writ may run.

Finally, to those nations who would make themselves our adversary, we offer not a pledge but a request: that both sides begin anew the quest for peace, before the dark powers of destruction unleashed by science engulf all humanity in planned or accidental self-destruction.

We dare not tempt them with weakness. For only when our arms are sufficient beyond doubt can we be certain beyond doubt that they will never be employed.

But neither can two great and powerful groups of nations take comfort from our present course--both sides overburdened by the cost of modern weapons, both rightly alarmed by the steady spread of the deadly atom, yet both racing to alter that uncertain balance of terror that stays the hand of mankind's final war.

So let us begin anew--remembering on both sides that civility is not a sign of weakness, and sincerity is always subject to proof. Let us never negotiate out of fear. But let us never fear to negotiate.

Let both sides explore what problems unite us instead of belaboring those problems which divide us.

Let both sides, for the first time, formulate serious and precise proposals for the inspection and control of arms--and bring the absolute power to destroy other nations under the absolute control of all nations.

Let both sides seek to invoke the wonders of science instead of its terrors. Together let us explore the stars, conquer the deserts, eradicate disease, tap the ocean depths, and encourage the arts and commerce.

Let both sides unite to heed in all corners of the earth the command of Isaiah--to undo the heavy burdens ... and to let the oppressed go free.

And if a beachhead of cooperation may push back the jungle of suspicion, let both sides join in creating a new endeavor, not a new balance of power, but a new world of law, where the strong are just and the weak secure and the peace preserved.

All this will not be finished in the first 100 days. Nor will it be finished in the first 1,000 days, nor in the life of this Administration, nor even perhaps in our lifetime on this planet. But let us begin.

In your hands, my fellow citizens, more than in mine, will rest the final success or failure of our course. Since this country was founded, each generation of Americans has been summoned to give testimony to its national loyalty. The graves of young Americans who answered the call to service surround the globe.

Now the trumpet summons us again--not as a call to bear arms, though arms we need; not as a call to battle, though embattled we are--but a call to bear the burden of a long twilight struggle, year in and year out, rejoicing in hope, patient in tribulation--a struggle against the common enemies of man: tyranny, poverty, disease, and war itself.

Can we forge against these enemies a grand and global alliance, North and South, East and West, that can assure a more fruitful life for all mankind? Will you join in that historic effort?

In the long history of the world, only a few generations have been granted the role of defending freedom in its hour of maximum danger. I do not shrink from this responsibility--I welcome it. I do not believe that any of us would exchange places with any other people or any other generation. The energy, the faith, the devotion which we bring to this endeavor will light our country and all who serve it--and the glow from that fire can truly light the world.

And so, my fellow Americans: ask not what your country can do for you--ask what you can do for your country.

My fellow citizens of the world: ask not what America will do for you, but what together we can do for the freedom of man.

Finally, whether you are citizens of America or citizens of the world, ask of us the same high standards of strength and sacrifice which we ask of you. With a good conscience our only sure reward, with history the final judge of our deeds, let us go forth to lead the land we love, asking His blessing and His help, but knowing that here on earth God's work must truly be our own.
```

- [ ] **Step 2: Run the generator for this speech**

Run: `npx tsx scripts/generate-transcript.mts`
Expected: prints a line starting with `John F. Kennedy's 1961 Inaugural Address: aligned N sentences; edit distance E.` where `N` is roughly 50-60 and `E` is small relative to the total word count. It also attempts the Eisenhower and Stanford entries — the Eisenhower one will succeed once Task 6 adds its source file; if Task 6 hasn't run yet, this command will stop with a "no such file" error after Kennedy's line has already printed and its JSON has already been written. That's fine — re-run this same command again after Task 6.

- [ ] **Step 3: Inspect the generated file**

Read `src/data/speeches/jfkInaugural.generated.json`. Confirm:
- The first line's `text` starts with "Vice President Johnson, Mr. Speaker, Mr. Chief Justice, President Eisenhower, Vice President Nixon, President Truman, reverend clergy, fellow citizens, we observe today...".
- The last line's `text` ends with "...that here on earth God's work must truly be our own.".
- `startSeconds`/`endSeconds` are ascending and non-overlapping across the file.

- [ ] **Step 4: Add the data module**

Create `src/data/speeches/jfkInaugural.ts`:

```ts
import type { Speech } from '../../domain/types'
import generatedLines from './jfkInaugural.generated.json'

export const JFK_INAUGURAL_SPEECH: Speech = {
  id: 'jfk-inaugural-1961',
  title: "John F. Kennedy's 1961 Inaugural Address",
  videoId: 'z5jGGYuep2Q',
  lines: generatedLines,
}
```

- [ ] **Step 5: Add the data test**

Create `src/data/speeches/jfkInaugural.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { JFK_INAUGURAL_SPEECH } from './jfkInaugural'
import { validateTranscript } from './validateTranscript'

describe('JFK inaugural address data', () => {
  it('covers the full official speech video with timed practice lines', () => {
    expect(JFK_INAUGURAL_SPEECH.videoId).toBe('z5jGGYuep2Q')
    expect(JFK_INAUGURAL_SPEECH.lines.length).toBeGreaterThan(20)
    expect(JFK_INAUGURAL_SPEECH.lines[0].text).toMatch(/^Vice President Johnson/)
    expect(JFK_INAUGURAL_SPEECH.lines.at(-1)?.text).toMatch(/God's work must truly be our own\.?$/)
  })

  it('has unique, ordered, non-overlapping boundaries', () => {
    expect(validateTranscript(JFK_INAUGURAL_SPEECH.lines)).toEqual([])
  })
})
```

- [ ] **Step 6: Register the speech in the catalog**

In `src/data/speeches/index.ts`, change:

```ts
import type { Speech } from '../../domain/types'
import { STANFORD_SPEECH } from './stanfordSpeech'

export const SPEECHES: Speech[] = [STANFORD_SPEECH]
```

to:

```ts
import type { Speech } from '../../domain/types'
import { STANFORD_SPEECH } from './stanfordSpeech'
import { JFK_INAUGURAL_SPEECH } from './jfkInaugural'

export const SPEECHES: Speech[] = [STANFORD_SPEECH, JFK_INAUGURAL_SPEECH]
```

- [ ] **Step 7: Run the unit test suite**

Run: `npm test`
Expected: PASS, including the two new `jfkInaugural.test.ts` cases.

- [ ] **Step 8: Commit**

```bash
git add scripts/sources/jfkInaugural.txt src/data/speeches/jfkInaugural.generated.json src/data/speeches/jfkInaugural.ts src/data/speeches/jfkInaugural.test.ts src/data/speeches/index.ts
git commit -m "Add JFK's 1961 Inaugural Address as a second catalog speech"
```

---

## Task 6: Prepare Eisenhower's 1961 Farewell Address

**Files:**
- Create: `scripts/sources/eisenhowerFarewell.txt`
- Create: `src/data/speeches/eisenhowerFarewell.generated.json` (generated, not hand-written)
- Create: `src/data/speeches/eisenhowerFarewell.ts`
- Create: `src/data/speeches/eisenhowerFarewell.test.ts`
- Modify: `src/data/speeches/index.ts`

**Sourcing:** Video `Lr9CrIfEA1A` ("President Eisenhower Farewell Address 1961 full speech") was confirmed in this session to carry clean captions starting at "Good evening, my fellow Americans." and ending at "Thank you and good night." The source text below is the National Archives' Milestone Documents transcript (`https://www.archives.gov/milestone-documents/president-dwight-d-eisenhowers-farewell-address`), a public-domain U.S. government work. It omits the broadcast's spoken opening ("Good evening, my fellow Americans...") and closing ("...Thank you and good night.") pleasantries that aren't part of the formal released text — those two caption lines simply won't anchor a sentence, which the alignment tolerates the same way it tolerates any other unmatched caption noise.

**Interfaces:**
- Consumes: `alignTranscript` from Task 4.
- Produces: adds a third entry to `SPEECHES` (from Task 2 / Task 5), consumed by Tasks 7-9.

- [ ] **Step 1: Add the source text**

Create `scripts/sources/eisenhowerFarewell.txt`:

```text
My fellow Americans:

Three days from now, after half a century in the service of our country, I shall lay down the responsibilities of office as, in traditional and solemn ceremony, the authority of the Presidency is vested in my successor.

This evening I come to you with a message of leave-taking and farewell, and to share a few final thoughts with you, my countrymen.

Like every other citizen, I wish the new President, and all who will labor with him, Godspeed. I pray that the coming years will be blessed with peace and prosperity for all.

Our people expect their President and the Congress to find essential agreement on issues of great moment, the wise resolution of which will better shape the future of the Nation.

My own relations with the Congress, which began on a remote and tenuous basis when, long ago, a member of the Senate appointed me to West Point, have since ranged to the intimate during the war and immediate post-war period, and, finally, to the mutually interdependent during these past eight years.

In this final relationship, the Congress and the Administration have, on most vital issues, cooperated well, to serve the national good rather than mere partisanship, and so have assured that the business of the Nation should go forward. So, my official relationship with the Congress ends in a feeling, on my part, of gratitude that we have been able to do so much together.

We now stand ten years past the midpoint of a century that has witnessed four major wars among great nations. Three of these involved our own country. Despite these holocausts America is today the strongest, the most influential and most productive nation in the world. Understandably proud of this pre-eminence, we yet realize that America's leadership and prestige depend, not merely upon our unmatched material progress, riches and military strength, but on how we use our power in the interests of world peace and human betterment.

Throughout America's adventure in free government, our basic purposes have been to keep the peace; to foster progress in human achievement, and to enhance liberty, dignity and integrity among people and among nations. To strive for less would be unworthy of a free and religious people. Any failure traceable to arrogance, or our lack of comprehension or readiness to sacrifice would inflict upon us grievous hurt both at home and abroad.

Progress toward these noble goals is persistently threatened by the conflict now engulfing the world. It commands our whole attention, absorbs our very beings. We face a hostile ideology-global in scope, atheistic in character, ruthless in purpose, and insidious in method. Unhappily the danger it poses promises to be of indefinite duration. To meet it successfully, there is called for, not so much the emotional and transitory sacrifices of crisis, but rather those which enable us to carry forward steadily, surely, and without complaint the burdens of a prolonged and complex struggle-with liberty at stake. Only thus shall we remain, despite every provocation, on our charted course toward permanent peace and human betterment.

Crises there will continue to be. In meeting them, whether foreign or domestic, great or small, there is a recurring temptation to feel that some spectacular and costly action could become the miraculous solution to all current difficulties. A huge increase in newer elements of our defense; development of unrealistic programs to cure every ill in agriculture; a dramatic expansion in basic and applied research-these and many other possibilities, each possibly promising in itself, may be suggested as the only way to the road we wish to travel.

But each proposal must be weighed in the light of a broader consideration: the need to maintain balance in and among national programs-balance between the private and the public economy, balance between cost and hoped for advantage-balance between the clearly necessary and the comfortably desirable; balance between our essential requirements as a nation and the duties imposed by the nation upon the individual; balance between action of the moment and the national welfare of the future. Good judgment seeks balance and progress; lack of it eventually finds imbalance and frustration.

The record of many decades stands as proof that our people and their government have, in the main, understood these truths and have responded to them well, in the face of stress and threat. But threats, new in kind or degree, constantly arise. I mention two only.

A vital element in keeping the peace is our military establishment. Our arms must be mighty, ready for instant action, so that no potential aggressor may be tempted to risk his own destruction.

Our military organization today bears little relation to that known by any of my predecessors in peace time, or indeed by the fighting men of World War II or Korea.

Until the latest of our world conflicts, the United States had no armaments industry. American makers of plowshares could, with time and as required, make swords as well. But now we can no longer risk emergency improvisation of national defense; we have been compelled to create a permanent armaments industry of vast proportions. Added to this, three and a half million men and women are directly engaged in the defense establishment. We annually spend on military security more than the net income of all United State corporations.

This conjunction of an immense military establishment and a large arms industry is new in the American experience. The total influence-economic, political, even spiritual-is felt in every city, every state house, every office of the Federal government. We recognize the imperative need for this development. Yet we must not fail to comprehend its grave implications. Our toil, resources and livelihood are all involved; so is the very structure of our society.

In the councils of government, we must guard against the acquisition of unwarranted influence, whether sought or unsought, by the military-industrial complex. The potential for the disastrous rise of misplaced power exists and will persist.

We must never let the weight of this combination endanger our liberties or democratic processes. We should take nothing for granted. Only an alert and knowledgeable citizenry can compel the proper meshing of the huge industrial and military machinery of defense with our peaceful methods and goals, so that security and liberty may prosper together.

Akin to, and largely responsible for the sweeping changes in our industrial-military posture, has been the technological revolution during recent decades.

In this revolution, research has become central; it also becomes more formalized, complex, and costly. A steadily increasing share is conducted for, by, or at the direction of, the Federal government.

Today, the solitary inventor, tinkering in his shop, has been over shadowed by task forces of scientists in laboratories and testing fields. In the same fashion, the free university, historically the fountainhead of free ideas and scientific discovery, has experienced a revolution in the conduct of research. Partly because of the huge costs involved, a government contract becomes virtually a substitute for intellectual curiosity. For every old blackboard there are now hundreds of new electronic computers.

The prospect of domination of the nation's scholars by Federal employment, project allocations, and the power of money is ever present and is gravely to be regarded.

Yet, in holding scientific research and discovery in respect, as we should, we must also be alert to the equal and opposite danger that public policy could itself become the captive of a scientific-technological elite.

It is the task of statesmanship to mold, to balance, and to integrate these and other forces, new and old, within the principles of our democratic system-ever aiming toward the supreme goals of our free society.

Another factor in maintaining balance involves the element of time. As we peer into society's future, we-you and I, and our government-must avoid the impulse to live only for today, plundering, for our own ease and convenience, the precious resources of tomorrow. We cannot mortgage the material assets of our grandchildren without risking the loss also of their political and spiritual heritage. We want democracy to survive for all generations to come, not to become the insolvent phantom of tomorrow.

Down the long lane of the history yet to be written America knows that this world of ours, ever growing smaller, must avoid becoming a community of dreadful fear and hate, and be, instead, a proud confederation of mutual trust and respect.

Such a confederation must be one of equals. The weakest must come to the conference table with the same confidence as do we, protected as we are by our moral, economic, and military strength. That table, though scarred by many past frustrations, cannot be abandoned for the certain agony of the battlefield.

Disarmament, with mutual honor and confidence, is a continuing imperative. Together we must learn how to compose difference, not with arms, but with intellect and decent purpose. Because this need is so sharp and apparent I confess that I lay down my official responsibilities in this field with a definite sense of disappointment. As one who has witnessed the horror and the lingering sadness of war-as one who knows that another war could utterly destroy this civilization which has been so slowly and painfully built over thousands of years-I wish I could say tonight that a lasting peace is in sight.

Happily, I can say that war has been avoided. Steady progress toward our ultimate goal has been made. But, so much remains to be done. As a private citizen, I shall never cease to do what little I can to help the world advance along that road.

So-in this my last good night to you as your President-I thank you for the many opportunities you have given me for public service in war and peace. I trust that in that service you find somethings worthy; as for the rest of it, I know you will find ways to improve performance in the future.

You and I-my fellow citizens-need to be strong in our faith that all nations, under God, will reach the goal of peace with justice. May we be ever unswerving in devotion to principle, confident but humble with power, diligent in pursuit of the Nation's great goals.

To all the peoples of the world, I once more give expression to America's prayerful and continuing inspiration:

We pray that peoples of all faiths, all races, all nations, may have their great human needs satisfied; that those now denied opportunity shall come to enjoy it to the full; that all who yearn for freedom may experience its spiritual blessings; that those who have freedom will understand, also, its heavy responsibilities; that all who are insensitive to the needs of others will learn charity; that the scourges of poverty, disease and ignorance will be made to disappear from the earth, and that, in the goodness of time, all peoples will come to live together in a peace guaranteed by the binding force of mutual respect and love.
```

- [ ] **Step 2: Run the generator for this speech**

Run: `npx tsx scripts/generate-transcript.mts`
Expected: prints the Kennedy line again first (harmless — it overwrites `jfkInaugural.generated.json` with the same result), then `Dwight D. Eisenhower's 1961 Farewell Address: aligned N sentences; edit distance E.` (N roughly 45-60). The command then throws on the final (Stanford) entry, since `/tmp/stanford-speech.txt` still doesn't exist — that's expected (see Task 4, Step 3) and does not affect the two JSON files already written by this point.

- [ ] **Step 3: Inspect the generated file**

Read `src/data/speeches/eisenhowerFarewell.generated.json`. Confirm:
- The first line's `text` starts with "My fellow Americans" or "Three days from now, after half a century..." (whichever the sentence splitter groups the salutation into).
- The last line's `text` ends with "...a peace guaranteed by the binding force of mutual respect and love.".
- `startSeconds`/`endSeconds` are ascending and non-overlapping across the file.

- [ ] **Step 4: Add the data module**

Create `src/data/speeches/eisenhowerFarewell.ts`:

```ts
import type { Speech } from '../../domain/types'
import generatedLines from './eisenhowerFarewell.generated.json'

export const EISENHOWER_FAREWELL_SPEECH: Speech = {
  id: 'eisenhower-farewell-1961',
  title: "Dwight D. Eisenhower's 1961 Farewell Address",
  videoId: 'Lr9CrIfEA1A',
  lines: generatedLines,
}
```

- [ ] **Step 5: Add the data test**

Create `src/data/speeches/eisenhowerFarewell.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { EISENHOWER_FAREWELL_SPEECH } from './eisenhowerFarewell'
import { validateTranscript } from './validateTranscript'

describe('Eisenhower farewell address data', () => {
  it('covers the full official speech video with timed practice lines', () => {
    expect(EISENHOWER_FAREWELL_SPEECH.videoId).toBe('Lr9CrIfEA1A')
    expect(EISENHOWER_FAREWELL_SPEECH.lines.length).toBeGreaterThan(20)
    expect(EISENHOWER_FAREWELL_SPEECH.lines.at(-1)?.text).toMatch(/binding force of mutual respect and love\.?$/)
  })

  it('has unique, ordered, non-overlapping boundaries', () => {
    expect(validateTranscript(EISENHOWER_FAREWELL_SPEECH.lines)).toEqual([])
  })
})
```

- [ ] **Step 6: Register the speech in the catalog**

In `src/data/speeches/index.ts`, change:

```ts
import type { Speech } from '../../domain/types'
import { STANFORD_SPEECH } from './stanfordSpeech'
import { JFK_INAUGURAL_SPEECH } from './jfkInaugural'

export const SPEECHES: Speech[] = [STANFORD_SPEECH, JFK_INAUGURAL_SPEECH]
```

to:

```ts
import type { Speech } from '../../domain/types'
import { STANFORD_SPEECH } from './stanfordSpeech'
import { JFK_INAUGURAL_SPEECH } from './jfkInaugural'
import { EISENHOWER_FAREWELL_SPEECH } from './eisenhowerFarewell'

export const SPEECHES: Speech[] = [STANFORD_SPEECH, JFK_INAUGURAL_SPEECH, EISENHOWER_FAREWELL_SPEECH]
```

- [ ] **Step 7: Run the unit test suite and build**

Run: `npm test`
Expected: PASS, including the two new `eisenhowerFarewell.test.ts` cases.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/sources/eisenhowerFarewell.txt src/data/speeches/eisenhowerFarewell.generated.json src/data/speeches/eisenhowerFarewell.ts src/data/speeches/eisenhowerFarewell.test.ts src/data/speeches/index.ts
git commit -m "Add Eisenhower's 1961 Farewell Address as a third catalog speech"
```

---

## Task 7: Extract the practice flow into a speech-parameterized `Practice` component

**Files:**
- Create: `src/features/practice/Practice.tsx` (extracted from `src/app/App.tsx`)
- Create: `src/features/practice/Practice.test.tsx` (extracted from `src/app/App.test.tsx`, adapted)
- Modify: `src/app/App.css` (one selector change, described below)
- Modify: `src/app/App.tsx` (shrinks drastically here; fully replaced again in Task 9 — see note at the end of this task)
- Delete: `src/app/App.test.tsx` (fully replaced in Task 9)

**Interfaces:**
- Consumes: `Speech` (Task 1), `SessionStore` (Task 3, including `getProgress` which `Practice` does not call).
- Produces: `Practice` component — `function Practice({ speech, store, onExitToLibrary, playerComponent, recorderFactory }: PracticeProps)`, where:
  ```ts
  type PracticeProps = {
    speech: Speech
    store: SessionStore
    onExitToLibrary: () => void
    playerComponent?: ComponentType<PlayerProps & RefAttributes<YouTubePlayerHandle>>
    recorderFactory?: () => Promise<AudioRecorderPort>
  }
  ```
  Consumed by `App` in Task 9.

- [ ] **Step 1: Create `Practice.tsx` from the current `App.tsx`**

Create `src/features/practice/Practice.tsx` with the content below. This is today's `App` component (`src/app/App.tsx`), with:
- `STANFORD_SPEECH` replaced by a `speech: Speech` prop throughout.
- `store` and the player/recorder factories now arrive as props instead of being created inside (the store is no longer optional/self-constructing here — `App`, in Task 9, owns the single shared `SessionStore` instance and passes it down to both `Practice` and `Library`).
- A "◀ Library" button added next to the brand link, calling a new `onExitToLibrary` prop.
- The `▶ Hear Steve` button copy generalized to `▶ Hear this line` (no longer specific to one speaker).
- The Quit & Erase confirmation copy naming the speech, so erasing one speech's progress from the library doesn't read as erasing everything.
- The downloaded MP3 filename derived from `speech.id` instead of the hardcoded Steve Jobs filename.

```tsx
import {
  type ComponentType,
  type RefAttributes,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { transition } from '../../domain/practiceMachine'
import type { PracticeState, Speech, StoredTake } from '../../domain/types'
import { exportSessionMp3 } from '../export/mp3Exporter'
import { createAudioRecorder, type AudioRecorderPort } from '../recorder/audioRecorder'
import { YouTubePlayer, type YouTubePlayerHandle } from '../player/YouTubePlayer'
import type { SessionStore } from '../session/sessionStore'
import { Transcript } from '../transcript/Transcript'
import '../../app/App.css'

type PlayerProps = {
  videoId: string
  onFinished: () => void
  onError: (message: string) => void
  onReady?: () => void
}

type PracticeProps = {
  speech: Speech
  store: SessionStore
  onExitToLibrary: () => void
  playerComponent?: ComponentType<PlayerProps & RefAttributes<YouTubePlayerHandle>>
  recorderFactory?: () => Promise<AudioRecorderPort>
}

function recordingFailureMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return 'Browser storage is full. Clear some space and record again.'
  }
  return error instanceof Error ? error.message : 'The recording could not be saved.'
}

export function Practice({
  speech,
  store,
  onExitToLibrary,
  playerComponent: PlayerComponent = YouTubePlayer,
  recorderFactory = createAudioRecorder,
}: PracticeProps) {
  const [state, dispatch] = useReducer(transition, speech, (initialSpeech): PracticeState => ({
    phase: 'ready',
    activeIndex: 0,
    lineCount: initialSpeech.lines.length,
    hasTake: false,
    error: null,
  }))
  const [takes, setTakes] = useState<Map<string, StoredTake>>(new Map())
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canRetryVideo, setCanRetryVideo] = useState(false)
  const [playerReady, setPlayerReady] = useState(PlayerComponent !== YouTubePlayer)
  const [playerAttempt, setPlayerAttempt] = useState(0)
  const playerRef = useRef<YouTubePlayerHandle>(null)
  const recorderRef = useRef<AudioRecorderPort | null>(null)
  const positionSaveRef = useRef(false)
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const showError = useCallback((message: string) => {
    setCanRetryVideo(false)
    dispatch({ type: 'EXTERNAL_ERROR', message })
  }, [])
  const showVideoError = useCallback((message: string) => {
    setCanRetryVideo(true)
    dispatch({ type: 'EXTERNAL_ERROR', message })
  }, [])
  const handlePlayerReady = useCallback(() => setPlayerReady(true), [])

  useEffect(() => {
    let current = true
    store.load(speech.id).then(({ session, takes: restoredTakes }) => {
      if (!current) return
      const restoredIndex = session
        ? speech.lines.findIndex((line) => line.id === session.activeLineId)
        : 0
      const index = restoredIndex >= 0 ? restoredIndex : 0
      const restoredMap = new Map(restoredTakes.map((take) => [take.lineId, take]))
      setTakes(restoredMap)
      dispatch({
        type: 'SELECT_LINE',
        index,
        hasTake: restoredMap.has(speech.lines[index].id),
      })
      setReady(true)
    }).catch(() => {
      if (!current) return
      showError('Your saved session could not be opened. Reload to try again.')
      setReady(true)
    })
    return () => {
      current = false
      recorderRef.current?.release()
      previewRef.current?.pause()
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [store, speech, showError])

  const activeLine = speech.lines[state.activeIndex]
  const handleSourceFinished = useCallback(() => dispatch({ type: 'SOURCE_FINISHED' }), [])

  function hearSource() {
    if (!playerReady) return
    dispatch({ type: 'HEAR_SOURCE' })
    playerRef.current?.playRange(activeLine.startSeconds, activeLine.endSeconds)
  }

  async function startRecording() {
    if (busy || recorderRef.current) return
    setBusy(true)
    try {
      const recorder = await recorderFactory()
      recorder.start()
      recorderRef.current = recorder
      dispatch({ type: 'START_RECORDING' })
    } catch (error) {
      showError(error instanceof Error ? error.message : 'The microphone could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current
    if (!recorder) return
    setBusy(true)
    try {
      const audio = await recorder.stop()
      const take: StoredTake = {
        lineId: activeLine.id,
        ...audio,
        recordedAt: new Date().toISOString(),
      }
      await store.replaceTake(speech.id, take)
      setTakes((previous) => new Map(previous).set(take.lineId, take))
      dispatch({ type: 'RECORDING_SAVED' })
    } catch (error) {
      setCanRetryVideo(false)
      dispatch({
        type: 'RECORDING_FAILED',
        message: recordingFailureMessage(error),
      })
    } finally {
      recorder.release()
      recorderRef.current = null
      setBusy(false)
    }
  }

  function listenToTake() {
    const take = takes.get(activeLine.id)
    if (!take) return
    previewRef.current?.pause()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(take.blob)
    previewUrlRef.current = url
    const audio = new Audio(url)
    previewRef.current = audio
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url)
      if (previewUrlRef.current === url) previewUrlRef.current = null
    }, { once: true })
    audio.play().catch(() => showError('The recording could not be played.'))
  }

  async function advance() {
    if (busy || positionSaveRef.current) return
    positionSaveRef.current = true
    setBusy(true)
    try {
      if (state.activeIndex === speech.lines.length - 1) {
        const missing = speech.lines.find((line) => !takes.has(line.id))
        if (missing) {
          showError('Some lines are still unrecorded. Select a missing line to finish the speech.')
          return
        }
      }
      const nextIndex = Math.min(state.activeIndex + 1, speech.lines.length - 1)
      await store.saveProgress({
        speechId: speech.id,
        activeLineId: speech.lines[nextIndex].id,
        completedLineIds: Array.from(takes.keys()),
        updatedAt: new Date().toISOString(),
      })
      dispatch({ type: 'NEXT' })
    } catch {
      showError('Progress could not be saved. Free browser storage and try again.')
    } finally {
      positionSaveRef.current = false
      setBusy(false)
    }
  }

  async function selectLine(lineId: string) {
    if (busy || positionSaveRef.current || state.phase === 'recording') return
    const index = speech.lines.findIndex((line) => line.id === lineId)
    if (index < 0) return
    positionSaveRef.current = true
    setBusy(true)
    try {
      await store.saveProgress({
        speechId: speech.id,
        activeLineId: lineId,
        completedLineIds: Array.from(takes.keys()),
        updatedAt: new Date().toISOString(),
      })
      playerRef.current?.cue(speech.lines[index].startSeconds)
      dispatch({ type: 'SELECT_LINE', index, hasTake: takes.has(lineId) })
    } catch {
      showError('Position could not be saved. Free browser storage and try again.')
    } finally {
      positionSaveRef.current = false
      setBusy(false)
    }
  }

  async function quitAndErase() {
    if (!window.confirm(`Delete all recordings and progress for "${speech.title}"?`)) return
    setBusy(true)
    try {
      recorderRef.current?.release()
      recorderRef.current = null
      previewRef.current?.pause()
      await store.discard(speech.id)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
      previewRef.current = null
      setTakes(new Map())
      dispatch({ type: 'SELECT_LINE', index: 0, hasTake: false })
    } catch {
      showError('The session could not be erased. Try again before closing this page.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadMp3() {
    setBusy(true)
    try {
      const blob = await exportSessionMp3({
        takes: Array.from(takes.values()),
        lineOrder: speech.lines.map((line) => line.id),
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${speech.id}-shadowing-session.mp3`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'The MP3 could not be created.')
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <main className="loading">Opening your practice session…</main>

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Speak Along home">Speak Along</a>
        <button type="button" className="quiet-button" onClick={onExitToLibrary}>◀ Library</button>
        <div className="session-meta">
          <span className="speech-name">{speech.title}</span>
          <span className="recorded-count">{takes.size} recorded</span>
          <button className="quiet-button" type="button" onClick={quitAndErase} disabled={busy}>
            Quit &amp; Erase
          </button>
        </div>
      </header>

      <main className="practice-layout">
        <section className="video-card" aria-label="Speech video">
          <PlayerComponent key={playerAttempt} ref={playerRef} videoId={speech.videoId} onFinished={handleSourceFinished} onError={showVideoError} onReady={handlePlayerReady} />
        </section>

        <section className="transcript-card" aria-label="Timed transcript">
          <Transcript lines={speech.lines} activeLineId={activeLine.id} onSelect={selectLine} disabled={busy || state.phase === 'recording' || state.phase === 'playing-source'} />
          <p className="progress">Line {state.activeIndex + 1} of {speech.lines.length}</p>
        </section>
      </main>

      {state.phase === 'completed' ? (
        <section className="finish-card" aria-label="Practice complete">
          <p className="eyebrow">Speech complete</p>
          <h1>Your voice made it to the end.</h1>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={downloadMp3} disabled={busy}>{busy ? 'Creating MP3…' : 'Download MP3'}</button>
            <button className="quiet-button" type="button" onClick={quitAndErase} disabled={busy}>Discard session</button>
          </div>
        </section>
      ) : (
        <section className="control-dock" aria-label="Practice controls">
          <div className="phase-copy" aria-live="polite">
            <span className="eyebrow">Your turn</span>
            <strong>
              {state.phase === 'playing-source' && 'Listen closely…'}
              {state.phase === 'ready' && 'Hear this line first'}
              {state.phase === 'ready-to-record' && 'Now say it your way'}
              {state.phase === 'recording' && 'Recording…'}
              {state.phase === 'recorded' && 'Take saved'}
            </strong>
          </div>
          <div className="button-row">
            <button type="button" className="control-button" onClick={hearSource} disabled={!playerReady || state.phase === 'playing-source' || state.phase === 'recording' || busy}>▶ Hear this line</button>
            {state.phase === 'recording' ? (
              <button aria-label="Stop" type="button" className="record-button is-recording" onClick={stopRecording} disabled={busy}>■ Stop</button>
            ) : (
              <button aria-label="Record" type="button" className="record-button" onClick={startRecording} disabled={!['ready-to-record', 'recorded'].includes(state.phase) || busy}>● Record</button>
            )}
            <button type="button" className="control-button" onClick={listenToTake} disabled={!takes.has(activeLine.id) || busy}>Listen</button>
            <button type="button" className="control-button" onClick={() => dispatch({ type: 'REDO' })} disabled={!takes.has(activeLine.id) || state.phase === 'recording' || busy}>Redo</button>
            <button aria-label="Next" type="button" className="next-button" onClick={advance} disabled={!['ready', 'ready-to-record', 'recorded'].includes(state.phase) || busy}>Next →</button>
          </div>
        </section>
      )}

      {state.error && <p className="error-banner" role="alert">{state.error} {canRetryVideo && <button type="button" onClick={() => { dispatch({ type: 'CLEAR_ERROR' }); setCanRetryVideo(false); setPlayerReady(PlayerComponent !== YouTubePlayer); setPlayerAttempt((value) => value + 1) }}>Retry video</button>}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Fix the mobile stylesheet selector for the new `speech-name` element**

In `src/app/App.css`, the current mobile rule hides every `<span>` inside `.session-meta` (there used to be only one: the recorded count). `Practice` now renders a second span (`speech-name`) that should stay visible on mobile. Change:

```css
  .session-meta > span { display: none; }
```

to:

```css
  .session-meta > .recorded-count { display: none; }
```

Also add, near the other `.session-meta`/`.eyebrow` rules (not inside the media query):

```css
.speech-name { font-weight: 600; color: #5b5548; }
```

- [ ] **Step 3: Create `Practice.test.tsx` from the current `App.test.tsx`**

Create `src/features/practice/Practice.test.tsx`. This is today's `src/app/App.test.tsx`, with:
- `App` replaced by `Practice`, imported from `./Practice`.
- Every `render(<App .../>)` call given `speech={STANFORD_SPEECH}` and `onExitToLibrary={() => {}}`, and `store` is now a required prop (no default), so every fake `SessionStore` also implements `getProgress` (add `async getProgress() { return { completedCount: 0, activeLineId: null } }` to each — its return value doesn't matter for these tests).
- The `/hear steve/i` button-name matcher changed to `/hear this line/i`.
- The import of `STANFORD_SPEECH` updated to the new data path.

```tsx
import { forwardRef, useImperativeHandle } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Practice } from './Practice'
import type { SessionStore } from '../session/sessionStore'
import type { YouTubePlayerHandle } from '../player/YouTubePlayer'
import type { AudioRecorderPort } from '../recorder/audioRecorder'
import { STANFORD_SPEECH } from '../../data/speeches/stanfordSpeech'

function createRestoredStore(): SessionStore {
  let erased = false
  return {
    async load() {
      return erased
        ? { session: null, takes: [] }
        : {
            session: {
              speechId: 'steve-jobs-stanford-2005',
              activeLineId: 'line-002',
              completedLineIds: ['line-001'],
              updatedAt: '2026-09-16T00:00:00.000Z',
            },
            takes: [],
          }
    },
    async getProgress() {
      return { completedCount: 0, activeLineId: null }
    },
    async saveProgress() {},
    async replaceTake() {},
    async discard() {
      erased = true
    },
  }
}

describe('Quit & Erase', () => {
  it('keeps progress when canceled and resets after confirmation', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    render(<Practice speech={STANFORD_SPEECH} store={createRestoredStore()} onExitToLibrary={() => {}} />)

    expect(await screen.findByText(`Line 2 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()

    confirm.mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: /quit & erase/i }))
    expect(screen.getByText(`Line 2 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()

    confirm.mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: /quit & erase/i }))
    expect(await screen.findByText(`Line 1 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()
  })
})

describe('guided practice loop', () => {
  it('links home to the configured deployment base path', async () => {
    render(<Practice speech={STANFORD_SPEECH} store={createRestoredStore()} onExitToLibrary={() => {}} />)

    await screen.findByText(`Line 2 of ${STANFORD_SPEECH.lines.length}`)
    expect(screen.getByRole('link', { name: 'Speak Along home' })).toHaveAttribute(
      'href',
      import.meta.env.BASE_URL,
    )
  })

  it('serializes pending Next saves so duplicate clicks advance only once', async () => {
    let resolveSave!: () => void
    const pendingSave = new Promise<void>((resolve) => { resolveSave = resolve })
    const saveProgress = vi.fn(() => pendingSave)
    const store: SessionStore = {
      async load() {
        return {
          session: {
            speechId: 'steve-jobs-stanford-2005',
            activeLineId: 'line-143',
            completedLineIds: [],
            updatedAt: '2026-09-21T00:00:00.000Z',
          },
          takes: [],
        }
      },
      async getProgress() {
        return { completedCount: 0, activeLineId: null }
      },
      saveProgress,
      async replaceTake() {},
      async discard() {},
    }
    render(<Practice speech={STANFORD_SPEECH} store={store} onExitToLibrary={() => {}} />)

    await screen.findByText(`Line 143 of ${STANFORD_SPEECH.lines.length}`)
    const next = screen.getByRole('button', { name: /^next$/i })
    fireEvent.click(next)
    fireEvent.click(next)

    expect(saveProgress).toHaveBeenCalledOnce()
    expect(next).toBeDisabled()

    await act(async () => resolveSave())

    expect(await screen.findByText(`Line 144 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /practice complete/i })).not.toBeInTheDocument()
  })

  it('keeps an incomplete final line open with missing transcript lines selectable', async () => {
    const user = userEvent.setup()
    const saveProgress = vi.fn()
    const store: SessionStore = {
      async load() {
        return {
          session: {
            speechId: 'steve-jobs-stanford-2005',
            activeLineId: 'line-144',
            completedLineIds: [],
            updatedAt: '2026-09-21T00:00:00.000Z',
          },
          takes: [],
        }
      },
      async getProgress() {
        return { completedCount: 0, activeLineId: null }
      },
      saveProgress,
      async replaceTake() {},
      async discard() {},
    }
    render(<Practice speech={STANFORD_SPEECH} store={store} onExitToLibrary={() => {}} />)

    await screen.findByText(`Line 144 of ${STANFORD_SPEECH.lines.length}`)
    await user.click(screen.getByRole('button', { name: /^next$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Some lines are still unrecorded')
    expect(screen.getByText(`Line 144 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: STANFORD_SPEECH.lines[0].text })).toBeEnabled()
    expect(saveProgress).not.toHaveBeenCalled()
  })

  it('advances to the next line without requiring a recording', async () => {
    const user = userEvent.setup()
    render(<Practice speech={STANFORD_SPEECH} store={createRestoredStore()} onExitToLibrary={() => {}} />)

    await screen.findByText(`Line 2 of ${STANFORD_SPEECH.lines.length}`)
    const next = screen.getByRole('button', { name: /^next$/i })
    expect(next).toBeEnabled()

    await user.click(next)

    expect(await screen.findByText(`Line 3 of ${STANFORD_SPEECH.lines.length}`)).toBeInTheDocument()
  })

  it('plays one line, records a take, and enables Next', async () => {
    const user = userEvent.setup()
    const store = createRestoredStore()
    const recorder: AudioRecorderPort = {
      start() {},
      async stop() {
        return {
          blob: new Blob(['voice'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          durationMs: 900,
        }
      },
      release() {},
    }
    const FakePlayer = forwardRef<YouTubePlayerHandle, {
      onFinished: () => void
      onError: (message: string) => void
      videoId: string
    }>(function FakePlayer({ onFinished }, ref) {
      useImperativeHandle(ref, () => ({ playRange() {}, cue() {} }))
      return <button onClick={onFinished}>Finish source line</button>
    })

    render(
      <Practice
        speech={STANFORD_SPEECH}
        store={store}
        onExitToLibrary={() => {}}
        playerComponent={FakePlayer}
        recorderFactory={async () => recorder}
      />,
    )

    await screen.findByText(`Line 2 of ${STANFORD_SPEECH.lines.length}`)
    await user.click(screen.getByRole('button', { name: /hear this line/i }))
    await user.click(screen.getByRole('button', { name: /finish source line/i }))
    await user.click(screen.getByRole('button', { name: /^record$/i }))
    await user.click(screen.getByRole('button', { name: /^stop$/i }))

    expect(screen.getByRole('button', { name: /^listen$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^redo$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled()
  })

  it('shows a microphone error instead of silently failing', async () => {
    const user = userEvent.setup()
    const FakePlayer = forwardRef<YouTubePlayerHandle, {
      onFinished: () => void
      onError: (message: string) => void
      videoId: string
    }>(function FakePlayer({ onFinished }, ref) {
      useImperativeHandle(ref, () => ({ playRange() {}, cue() {} }))
      return <button onClick={onFinished}>Finish source line</button>
    })
    render(
      <Practice
        speech={STANFORD_SPEECH}
        store={createRestoredStore()}
        onExitToLibrary={() => {}}
        playerComponent={FakePlayer}
        recorderFactory={async () => { throw new Error('Microphone blocked.') }}
      />,
    )
    await screen.findByText(`Line 2 of ${STANFORD_SPEECH.lines.length}`)
    await user.click(screen.getByRole('button', { name: /hear this line/i }))
    await user.click(screen.getByRole('button', { name: /finish source line/i }))
    await user.click(screen.getByRole('button', { name: /^record$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone blocked.')
  })
})
```

- [ ] **Step 4: Delete the old `App.tsx`/`App.test.tsx` pair (temporarily replaced with a minimal passthrough)**

`App.tsx` is rewritten properly in Task 9. To keep the build green in between, replace `src/app/App.tsx` with a minimal passthrough for now:

```tsx
import { createSessionStore } from '../features/session/sessionStore'
import { Practice } from '../features/practice/Practice'
import { STANFORD_SPEECH } from '../data/speeches/stanfordSpeech'

export function App() {
  return <Practice speech={STANFORD_SPEECH} store={createSessionStore()} onExitToLibrary={() => {}} />
}
```

Delete `src/app/App.test.tsx` (its coverage now lives in `Practice.test.tsx`; `App.tsx` itself gets fresh, shell-focused tests in Task 9).

- [ ] **Step 5: Run the unit test suite and build**

Run: `npm test`
Expected: PASS — the `Practice.test.tsx` suite passes; there is no `App.test.tsx` to run yet.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/practice src/app/App.css src/app/App.tsx
git rm src/app/App.test.tsx
git commit -m "Extract the practice flow into a speech-parameterized Practice component"
```

---

## Task 8: Build the `Library` screen

**Files:**
- Create: `src/features/library/Library.tsx`
- Create: `src/features/library/Library.test.tsx`
- Modify: `src/app/App.css` (new styles, appended)

**Interfaces:**
- Consumes: `Speech` (Task 1), `SessionStore.getProgress` (Task 3).
- Produces: `Library` component — `function Library({ speeches, store, onSelect }: LibraryProps)`, where:
  ```ts
  type LibraryProps = {
    speeches: Speech[]
    store: SessionStore
    onSelect: (speechId: string) => void
  }
  ```
  Consumed by `App` in Task 9.

- [ ] **Step 1: Write the failing tests**

Create `src/features/library/Library.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Library } from './Library'
import type { SessionStore } from '../session/sessionStore'
import type { Speech } from '../../domain/types'

const speeches: Speech[] = [
  {
    id: 'speech-a',
    title: 'Speech A',
    videoId: 'videoA',
    lines: [
      { id: 'line-001', sequence: 0, text: 'One.', startSeconds: 0, endSeconds: 1 },
      { id: 'line-002', sequence: 1, text: 'Two.', startSeconds: 1, endSeconds: 2 },
    ],
  },
  {
    id: 'speech-b',
    title: 'Speech B',
    videoId: 'videoB',
    lines: [
      { id: 'line-001', sequence: 0, text: 'One.', startSeconds: 0, endSeconds: 1 },
    ],
  },
]

function createStore(progress: Record<string, number>): SessionStore {
  return {
    async load() {
      return { session: null, takes: [] }
    },
    async getProgress(speechId) {
      return { completedCount: progress[speechId] ?? 0, activeLineId: null }
    },
    async saveProgress() {},
    async replaceTake() {},
    async discard() {},
  }
}

describe('Library', () => {
  it('shows every speech with its progress', async () => {
    render(<Library speeches={speeches} store={createStore({ 'speech-a': 1 })} onSelect={() => {}} />)

    expect(await screen.findByText('1/2 recorded')).toBeInTheDocument()
    expect(await screen.findByText('Not started')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Speech A/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Speech B/ })).toBeInTheDocument()
  })

  it('selects a speech by id when its card is chosen', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Library speeches={speeches} store={createStore({})} onSelect={onSelect} />)

    await user.click(await screen.findByRole('button', { name: /Speech B/ }))

    expect(onSelect).toHaveBeenCalledWith('speech-b')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/library/Library.test.tsx`
Expected: FAIL — `Cannot find module './Library'`.

- [ ] **Step 3: Implement `Library`**

Create `src/features/library/Library.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Speech } from '../../domain/types'
import type { SessionStore } from '../session/sessionStore'
import '../../app/App.css'

type LibraryProps = {
  speeches: Speech[]
  store: SessionStore
  onSelect: (speechId: string) => void
}

type ProgressEntry = { completedCount: number }

export function Library({ speeches, store, onSelect }: LibraryProps) {
  const [progress, setProgress] = useState<Map<string, ProgressEntry>>(new Map())

  useEffect(() => {
    let current = true
    Promise.all(
      speeches.map(async (speech) => [speech.id, await store.getProgress(speech.id)] as const),
    ).then((entries) => {
      if (!current) return
      setProgress(new Map(entries))
    })
    return () => {
      current = false
    }
  }, [speeches, store])

  return (
    <div className="library-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Speak Along home">Speak Along</a>
      </header>
      <main className="library-grid" aria-label="Speech library">
        {speeches.map((speech) => {
          const completedCount = progress.get(speech.id)?.completedCount ?? 0
          return (
            <button
              key={speech.id}
              type="button"
              className="speech-card"
              onClick={() => onSelect(speech.id)}
            >
              <img className="speech-thumbnail" src={`https://img.youtube.com/vi/${speech.videoId}/hqdefault.jpg`} alt="" />
              <span className="speech-title">{speech.title}</span>
              <span className="speech-progress">
                {completedCount > 0 ? `${completedCount}/${speech.lines.length} recorded` : 'Not started'}
              </span>
            </button>
          )
        })}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/library/Library.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Add library styles**

Append to `src/app/App.css`:

```css
.library-shell { min-height: 100vh; padding: 0 4vw 2rem; }
.library-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.5rem; max-width: 1400px; margin: 2rem auto; }
.speech-card { display: flex; flex-direction: column; gap: .5rem; border: 1px solid #d8d0c1; border-radius: 18px; background: #faf8f2; padding: 1rem; cursor: pointer; text-align: left; }
.speech-thumbnail { width: 100%; border-radius: 12px; aspect-ratio: 16/9; object-fit: cover; }
.speech-title { font-family: Georgia, serif; font-size: 1.1rem; font-weight: 700; }
.speech-progress { color: #706a60; font-size: .85rem; }
```

- [ ] **Step 6: Commit**

```bash
git add src/features/library src/app/App.css
git commit -m "Add the speech library screen"
```

---

## Task 9: Rewire `App` as a Library/Practice shell

**Files:**
- Modify: `src/app/App.tsx` (full rewrite, replacing the Task 7 passthrough)
- Create: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `Library` (Task 8), `Practice` (Task 7), `SPEECHES` (Task 2/5/6), `SessionStore` (Task 3).
- Produces: the top-level `App` component's public props, including two new optional test-only seams:
  ```ts
  type AppProps = {
    speeches?: Speech[]
    store?: SessionStore
    playerComponent?: ComponentType<PlayerProps & RefAttributes<YouTubePlayerHandle>>
    recorderFactory?: () => Promise<AudioRecorderPort>
  }
  ```
  `speeches` defaults to the real `SPEECHES` catalog; tests override it with small fixtures so assertions don't depend on the real transcripts' line counts.

- [ ] **Step 1: Write the failing tests**

Create `src/app/App.test.tsx`:

```tsx
import { forwardRef, useImperativeHandle } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import type { SessionStore } from '../features/session/sessionStore'
import type { YouTubePlayerHandle } from '../features/player/YouTubePlayer'
import type { Speech } from '../domain/types'

const speeches: Speech[] = [
  {
    id: 'speech-a',
    title: 'Speech A',
    videoId: 'videoA',
    lines: [
      { id: 'line-001', sequence: 0, text: 'One.', startSeconds: 0, endSeconds: 1 },
    ],
  },
  {
    id: 'speech-b',
    title: 'Speech B',
    videoId: 'videoB',
    lines: [
      { id: 'line-001', sequence: 0, text: 'Uno.', startSeconds: 0, endSeconds: 1 },
    ],
  },
]

function createStore(): SessionStore {
  return {
    async load() {
      return { session: null, takes: [] }
    },
    async getProgress() {
      return { completedCount: 0, activeLineId: null }
    },
    async saveProgress() {},
    async replaceTake() {},
    async discard() {},
  }
}

const FakePlayer = forwardRef<YouTubePlayerHandle, {
  onFinished: () => void
  onError: (message: string) => void
  videoId: string
}>(function FakePlayer(_props, ref) {
  useImperativeHandle(ref, () => ({ playRange() {}, cue() {} }))
  return <div />
})

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows the library first, then the chosen speech, then returns to the library', async () => {
    const user = userEvent.setup()
    render(<App speeches={speeches} store={createStore()} playerComponent={FakePlayer} />)

    expect(await screen.findByRole('button', { name: /Speech B/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Speech B/ }))
    expect(await screen.findByText('Line 1 of 1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /library/i }))
    expect(await screen.findByRole('button', { name: /Speech B/ })).toBeInTheDocument()
  })

  it('remembers the last-opened speech across remounts', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App speeches={speeches} store={createStore()} playerComponent={FakePlayer} />)

    await user.click(await screen.findByRole('button', { name: /Speech A/ }))
    await screen.findByText('Line 1 of 1')
    unmount()

    render(<App speeches={speeches} store={createStore()} playerComponent={FakePlayer} />)
    expect(await screen.findByText('Line 1 of 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Speech A/ })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/App.test.tsx`
Expected: FAIL — the Task 7 passthrough `App` ignores `speeches`/renders only the Stanford speech, so the "Speech A"/"Speech B" library cards never appear.

- [ ] **Step 3: Rewrite `App.tsx` as the shell**

Replace the entire contents of `src/app/App.tsx` with:

```tsx
import { type ComponentType, type RefAttributes, useMemo, useState } from 'react'
import { SPEECHES } from '../data/speeches'
import type { Speech } from '../domain/types'
import type { AudioRecorderPort } from '../features/recorder/audioRecorder'
import { Library } from '../features/library/Library'
import { Practice } from '../features/practice/Practice'
import type { YouTubePlayerHandle } from '../features/player/YouTubePlayer'
import { createSessionStore, type SessionStore } from '../features/session/sessionStore'

type PlayerProps = {
  videoId: string
  onFinished: () => void
  onError: (message: string) => void
  onReady?: () => void
}

type AppProps = {
  speeches?: Speech[]
  store?: SessionStore
  playerComponent?: ComponentType<PlayerProps & RefAttributes<YouTubePlayerHandle>>
  recorderFactory?: () => Promise<AudioRecorderPort>
}

const LAST_SPEECH_STORAGE_KEY = 'shadowing:lastSpeechId'

function readLastSpeechId(speeches: Speech[]): string | null {
  try {
    const stored = localStorage.getItem(LAST_SPEECH_STORAGE_KEY)
    return stored && speeches.some((speech) => speech.id === stored) ? stored : null
  } catch {
    return null
  }
}

function writeLastSpeechId(speechId: string | null) {
  try {
    if (speechId) localStorage.setItem(LAST_SPEECH_STORAGE_KEY, speechId)
    else localStorage.removeItem(LAST_SPEECH_STORAGE_KEY)
  } catch {
    // localStorage may be unavailable (private browsing); the in-memory selection still works this session.
  }
}

export function App({
  speeches = SPEECHES,
  store: suppliedStore,
  playerComponent,
  recorderFactory,
}: AppProps) {
  const store = useMemo(() => suppliedStore ?? createSessionStore(), [suppliedStore])
  const [selectedSpeechId, setSelectedSpeechId] = useState<string | null>(() => readLastSpeechId(speeches))

  const selectedSpeech = speeches.find((speech) => speech.id === selectedSpeechId) ?? null

  function selectSpeech(speechId: string) {
    setSelectedSpeechId(speechId)
    writeLastSpeechId(speechId)
  }

  function exitToLibrary() {
    setSelectedSpeechId(null)
    writeLastSpeechId(null)
  }

  if (!selectedSpeech) {
    return <Library speeches={speeches} store={store} onSelect={selectSpeech} />
  }

  return (
    <Practice
      key={selectedSpeech.id}
      speech={selectedSpeech}
      store={store}
      onExitToLibrary={exitToLibrary}
      playerComponent={playerComponent}
      recorderFactory={recorderFactory}
    />
  )
}
```

Note: exiting to the library also clears the remembered speech, so returning to the library and refreshing shows the library again rather than snapping back into the speech you just left — matches the "◀ Library" button reading as a real exit, not a pause.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/App.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full unit test suite and build**

Run: `npm test`
Expected: PASS, all suites.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx src/app/App.test.tsx
git commit -m "Rewire App as a Library/Practice shell with last-speech memory"
```

---

## Task 10: Update end-to-end tests for the library step

**Files:**
- Modify: `e2e/practice.spec.ts`

**Interfaces:**
- Consumes: the real `SPEECHES` catalog (via the running app), specifically that the Stanford entry's title contains "Stanford Commencement" and its `id` is `steve-jobs-stanford-2005`.

Every existing scenario in this file starts with `await page.goto('/')` and immediately expects to already be inside the Stanford practice screen (`Line 1 of 144`). With the library screen in front of it, each scenario needs one extra step: pick the Stanford card. Because the chosen speech is now remembered in `localStorage` for the rest of that test (including across `page.reload()`), no other change is needed — the remaining assertions in every scenario are unchanged.

- [ ] **Step 1: Add a helper for selecting the Stanford speech**

Task 2 already updated this file's transcript JSON import to `'../src/data/speeches/stanfordSpeech.generated.json'` — confirm that import is already in place (no change needed here).

Add this helper directly above `test.beforeEach`:

```ts
async function openStanfordSpeech(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Stanford Commencement/ }).click()
}
```

- [ ] **Step 2: Select the speech at the start of every scenario**

In each of the 8 `test(...)` blocks in this file, insert `await openStanfordSpeech(page)` immediately after the first `await page.goto('/')` line in that test. For example, change:

```ts
test('shows the Stanford practice screen and erases only after confirmation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Line 1 of 144')).toBeVisible()
```

to:

```ts
test('shows the Stanford practice screen and erases only after confirmation', async ({ page }) => {
  await page.goto('/')
  await openStanfordSpeech(page)
  await expect(page.getByText('Line 1 of 144')).toBeVisible()
```

Apply the same one-line insertion (`await openStanfordSpeech(page)` right after `await page.goto('/')`) to the other 7 tests in the file: `'advances without recording and restores the skipped position'`, `'restores the recorded take and next line after refresh'`, `'explains microphone denial and keeps the current line'`, `'preserves the previous take when a replacement cannot be stored'`, `'recovers from an initial video failure when retried'`, `'downloads a completed session as MP3'`, and `'preserves a completed session when MP3 creation fails'`.

- [ ] **Step 3: Update the MP3 filename assertions**

The downloaded filename is now derived from the speech id (Task 7, Step 1), so the Stanford speech's file is `steve-jobs-stanford-2005-shadowing-session.mp3` instead of `steve-jobs-shadowing-session.mp3`. In the `'downloads a completed session as MP3'` test, change:

```ts
  expect(download.suggestedFilename()).toBe('steve-jobs-shadowing-session.mp3')
```

to:

```ts
  expect(download.suggestedFilename()).toBe('steve-jobs-stanford-2005-shadowing-session.mp3')
```

In the `'preserves a completed session when MP3 creation fails'` test, change:

```ts
  expect((await downloadPromise).suggestedFilename()).toBe('steve-jobs-shadowing-session.mp3')
```

to:

```ts
  expect((await downloadPromise).suggestedFilename()).toBe('steve-jobs-stanford-2005-shadowing-session.mp3')
```

- [ ] **Step 4: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS, all 16 scenarios (8 tests × desktop/mobile).

- [ ] **Step 5: Commit**

```bash
git add e2e/practice.spec.ts
git commit -m "Update end-to-end tests for the speech library step"
```

---

## Task 11: Update project documentation

**Files:**
- Modify: `README.md`
- Modify: `STATUS.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update `README.md`**

In the file's opening paragraph, change:

```markdown
A private, sentence-by-sentence English shadowing app built around Steve Jobs' 2005 Stanford commencement address.
```

to:

```markdown
A private, sentence-by-sentence English shadowing app with a small library of prepared speeches to practice with.
```

In the **Practice flow** section, change step 1 from:

```markdown
1. Select **Hear Steve** to play the active sentence.
```

to:

```markdown
1. Choose a speech from the library, then select **Hear this line** to play the active sentence.
```

In the **Project structure** section, change:

```text
src/data/                Prepared transcript and sentence timings
```

to:

```text
src/data/speeches/       Speech catalog: prepared transcripts and sentence timings
src/features/library/    Speech-selection screen
src/features/practice/   Practice flow for one selected speech
```

Replace the **Scope** section:

```markdown
## Scope

This project supports one prepared speech. Pronunciation scoring, speech recognition, user accounts, arbitrary videos, and cloud synchronization are intentionally out of scope.
```

with:

```markdown
## Scope

This project supports a small, developer-curated catalog of prepared speeches (see `src/data/speeches/`), not arbitrary user-supplied videos. Adding a new speech means preparing its transcript timing data and registering it in the catalog — there is no in-app "add a video" flow. Pronunciation scoring, speech recognition, user accounts, and cloud synchronization are intentionally out of scope.
```

- [ ] **Step 2: Update `STATUS.md`**

Replace the "Current state" bullet:

```markdown
- The fixed practice source is Stanford's Steve Jobs 2005 commencement video (`UF8uR6Z6KLc`).
```

with:

```markdown
- The app now offers a small catalog of prepared speeches (`src/data/speeches/`): Steve Jobs' 2005 Stanford address, JFK's 1961 Inaugural Address, and Eisenhower's 1961 Farewell Address. A library screen lists them with per-speech progress; picking one enters the practice flow for that speech.
```

Update the "Main files" list, adding after the existing `src/app/App.tsx` line:

```markdown
- `src/features/library/Library.tsx` — speech-selection screen.
- `src/features/practice/Practice.tsx` — practice flow for one selected speech (formerly the body of `App.tsx`).
- `src/data/speeches/` — the speech catalog and each speech's transcript/timings.
- `scripts/lib/alignTranscript.mts` — reusable transcript/caption alignment used to prepare each speech's timings.
```

- [ ] **Step 3: Commit**

```bash
git add README.md STATUS.md
git commit -m "Update docs for the multi-speech library"
```

---

## Post-implementation follow-up (not part of this plan's tasks)

Once all tasks are merged, manually run `npm run dev`, open the app, and spot-check the JFK and Eisenhower practice flows with a real microphone the same way `STATUS.md` already flags for Stanford — confirm playback pauses at natural sentence boundaries for a few lines near the start, middle, and end of each new speech, and correct any inaccurate timestamps directly in the affected `.generated.json` file (do not hand-edit; re-run `npx tsx scripts/generate-transcript.mts` after fixing the source text instead, so the file stays a build artifact of the source text, not something manually patched).
