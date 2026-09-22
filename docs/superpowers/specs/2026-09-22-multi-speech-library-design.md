# Multi-Speech Library

## Purpose

Extend the shadowing app to support more than one prepared speech. Today the app hardcodes Steve Jobs' 2005 Stanford address everywhere: the data module, the session store's type, the practice screen, and the exported MP3 filename. This design replaces the single hardcoded speech with a small, developer-curated catalog of speeches, and adds a library screen for choosing among them.

This is a mechanism, not an open-ended video importer. Adding a new speech remains a developer task (drop in a prepared transcript file and register it in the catalog) — there is no in-app "add a video by URL" feature, and no automatic caption fetching at runtime. Two additional sample speeches are prepared as part of this work so the library is not empty on day one.

## Speech Catalog

A `Speech` type replaces the single `STANFORD_SPEECH` constant:

```ts
type Speech = {
  id: string
  title: string
  videoId: string
  lines: TranscriptLine[]
}
```

`src/data/speeches/` holds one module per speech (each pairing a `.generated.json` transcript with a thin wrapper, mirroring today's `stanfordSpeech.ts`) plus an `index.ts` exporting `SPEECHES: Speech[]`. The Stanford speech becomes the first catalog entry, unchanged in content.

Two more speeches are prepared using the same alignment process as the existing one (see "Content generation" below):

- JFK's 1961 Inaugural Address — public domain U.S. government work, low copyright risk.
- MLK's "I Have a Dream" (1963) — same copyright posture the app already accepts for the Steve Jobs speech (private, non-commercial, no upload); flagged here for visibility, not because it changes the design.

Exact video IDs and source transcript text are confirmed against real, currently-available YouTube videos during implementation, not guessed.

## Storage

`sessionStore.ts` is already keyed by `speechId` per operation (`load`, `saveProgress`, `replaceTake`, `discard` all take a `speechId`) — no IndexedDB schema change is needed. `PracticeSession.speechId` and every `SessionStore` method signature widen from the literal `'steve-jobs-stanford-2005'` to `string`.

One method is added:

```ts
getProgress(speechId: string): Promise<{ completedCount: number; activeLineId: string | null }>
```

It reads the `session` object store and uses `count()` on the `takes` store's existing `by-speech` index, so the library screen can show every speech's progress without loading any recorded audio into memory.

## UI

`App.tsx` becomes a thin shell holding two pieces of state: `view: 'library' | 'practice'` and `selectedSpeechId: string | null`.

- **Library** (`src/features/library/Library.tsx`): a grid of cards, one per catalog speech, each showing the YouTube thumbnail (`https://img.youtube.com/vi/{videoId}/hqdefault.jpg`), title, and progress (`"{completedCount}/{lines.length} recorded"`, or "Not started"). Selecting a card enters practice for that speech.
- **Practice** (`src/features/practice/Practice.tsx`): today's entire practice flow (video, transcript, recording controls, Quit & Erase, completion/MP3 screen), extracted from `App.tsx` with no behavior changes, taking `speech: Speech` as a prop instead of importing the hardcoded constant. A "◀ Library" header link returns to the library. The downloaded MP3 filename is derived from `speech.id` instead of the hardcoded `steve-jobs-shadowing-session.mp3`.

The last-opened speech's id is remembered in `localStorage` (not IndexedDB — this is a UI convenience, not practice data) so refreshing mid-practice re-enters that speech's practice screen directly rather than dropping back to the library. First visit, or an id no longer in the catalog, shows the library.

Quit & Erase keeps its current behavior: it erases only the active speech's saved session and takes, not the whole library. This already falls out of the existing per-speech storage keying.

## Out of Scope

- Arbitrary user-supplied YouTube URLs.
- An in-app "add a speech" flow.
- Any change to the practice state machine (`practiceMachine.ts`) or the transcript component (`Transcript.tsx`) — both are already generic over line count and content.
- Cross-device sync of the "last opened speech" convenience value.

## Content Generation

`scripts/generate-transcript.mts` is generalized from a single hardcoded script into a reusable alignment function parameterized by video id, source transcript text, and the sentence-boundary anchors used to slice the speech out of that text (mirroring the existing `first`/`last` anchor logic). It is run once per new speech to produce that speech's `.generated.json`, the same artifact the Stanford speech already has checked in. The script remains a one-time content-generation tool; the website does not run it.

## Testing

- `sessionStore.test.ts` gains coverage for `getProgress`, including a speech with no session yet.
- Existing `App.test.tsx` coverage is split: library-specific tests (rendering cards, progress display, selecting a card) move to a new `Library.test.tsx`; the rest move to `Practice.test.tsx` unchanged in substance, now driven with a speech fixture instead of the module-level constant.
- `e2e/practice.spec.ts` scenarios gain a first step that selects a speech from the library before the existing flow.
