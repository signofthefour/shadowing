# Shadowing site — handoff (2026-09-21)

## Current state

- A React/TypeScript/Vite site is in this folder. Run `npm run dev` and open the local URL printed by Vite.
- The app now offers a small catalog of prepared speeches (`src/data/speeches/`): Steve Jobs' 2005 Stanford address, JFK's 1961 Inaugural Address, and Eisenhower's 1961 Farewell Address. A library screen lists them with per-speech progress; picking one enters the practice flow for that speech.
- The checked-in transcript has 144 full sentences with non-overlapping timings. The page highlights and scrolls to the active sentence; clicking a line seeks to it.
- The guided loop plays one source sentence, waits for it to end, records one learner take, and offers Listen, Redo, and Next.
- Recordings and progress are stored locally in IndexedDB and can survive a refresh. No audio upload or account exists.
- **Quit & Erase** asks for confirmation, then deletes this site's saved takes and progress. Canceling changes nothing. It does not clear YouTube's own cookies or browser cache.
- At full completion, the site offers a combined MP3 download or session discard.
- Browser-level coverage now exercises record/restore/listen, failed replacement preservation, video retry, successful MP3 download, and retry after MP3 failure on desktop and mobile.
- Storage-full failures show an actionable message and retain the previous take. Only video failures display the **Retry video** action.
- The YouTube IFrame API now receives the exact host-page origin for secure `postMessage` communication.
- **Next** can advance and persist position without a recording; full completion and MP3 export still require all 144 takes.
- Pushes to `main` deploy a `/shadowing/` production build through GitHub Actions to `https://signofthefour.github.io/shadowing/`.

## Latest verification

- `npm test`: 26 tests passed (8 files).
- `npm run test:e2e`: 16 Chromium tests passed (8 scenarios on desktop and mobile).
- `npm run build`: passed.
- `npm run build -- --mode pages`: passed with `/shadowing/` asset URLs.

These checks prove the implemented paths they exercise; they do **not** prove precise sentence-end timing, a real-microphone session, audible recording quality, or audible full-speech MP3 quality.

## Next work

1. Run `npm run dev` and practice the first few sentences with a real microphone. Check that playback stops at a natural sentence boundary and that Listen/Redo/Next work.
2. Manually check timing at the three story transitions and the final sentence. Correct any inaccurate timestamps in `src/data/stanfordSpeech.generated.json`.
3. Complete a real-microphone session far enough to verify restored audio and audible MP3 playback/export; automated browser tests use deterministic media fakes.

## Notes

- `scripts/generate-transcript.mts` was used once to align the archived Stanford text with YouTube caption timing. It currently expects `/tmp/stanford-speech.txt`; the generated JSON is already checked in and the website does not run this script.
- Git publication is targeting the `main` branch at `git@github.com:signofthefour/shadowing.git`.
- A later message mentioned a “plot,” but no plotting code or plot files exist in this workspace. The subsequent “continue please” was treated as resuming this shadowing site.

## Main files

- `src/app/App.tsx` — practice flow, recording controls, Quit & Erase, MP3 download.
- `src/features/library/Library.tsx` — speech-selection screen.
- `src/features/practice/Practice.tsx` — practice flow for one selected speech (formerly the body of `App.tsx`).
- `src/data/speeches/` — the speech catalog and each speech's transcript/timings.
- `scripts/lib/alignTranscript.mts` — reusable transcript/caption alignment used to prepare each speech's timings.
- `src/data/stanfordSpeech.generated.json` — transcript text and timings.
- `src/features/session/sessionStore.ts` — local progress and recording storage.
- `src/features/player/youtubeApi.ts` — YouTube playback adapter.
- `src/features/export/mp3Exporter.ts` — combined MP3 creation.
- `docs/superpowers/specs/2026-09-16-steve-jobs-shadowing-design.md` — approved design.
- `docs/superpowers/plans/2026-09-16-steve-jobs-shadowing-implementation.md` — original implementation plan.
